import type { APIRoute } from 'astro';

type PostalLookupResponse = {
  found: boolean;
  codigo_postal: string;
  morada: string;
  bairro: string;
  cidade: string;
  display_name?: string;
};

function normalizePostalCode(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7) return null;
  const formatted = `${digits.slice(0, 4)}-${digits.slice(4, 7)}`;
  return { digits, formatted, cp4: digits.slice(0, 4), cp3: digits.slice(4, 7) };
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function firstRegex(html: string, re: RegExp) {
  const m = html.match(re);
  return m?.[1] ? stripTags(m[1]) : '';
}

function cleanupCsvPart(value: string) {
  return decodeHtml(value.replace(/\s+/g, ' ').trim());
}

function tryParseStructuredData(html: string, formatted: string) {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      const data = JSON.parse(raw);
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.['@graph'])
          ? data['@graph']
          : [data];

      for (const item of items) {
        const addr = item?.address || item;
        const postal = `${addr?.postalCode || ''}`.trim();
        if (!postal || !postal.includes(formatted)) continue;

        const morada = `${addr?.streetAddress || ''}`.trim();
        const cidade = `${addr?.addressLocality || addr?.addressRegion || ''}`.trim();
        const bairro = `${addr?.addressLocality || ''}`.trim();

        if (morada || cidade) {
          return {
            morada,
            bairro,
            cidade,
            display_name: `${morada}${morada && cidade ? ', ' : ''}${cidade}`,
          };
        }
      }
    } catch {
      // ignore malformed json-ld blocks
    }
  }

  return null;
}

function tryParseTable(html: string, formatted: string) {
  const codeEscaped = formatted.replace('-', '[\\s-]*');

  const rowRegexes = [
    new RegExp(`<tr[^>]*>[\\s\\S]*?<td[^>]*>\\s*(${codeEscaped})\\s*<\\/td>[\\s\\S]*?<td[^>]*>([\\s\\S]*?)<\\/td>[\\s\\S]*?<td[^>]*>([\\s\\S]*?)<\\/td>[\\s\\S]*?<\\/tr>`, 'i'),
    new RegExp(`<tr[^>]*>[\\s\\S]*?<td[^>]*>([\\s\\S]*?)<\\/td>[\\s\\S]*?<td[^>]*>\\s*(${codeEscaped})\\s*<\\/td>[\\s\\S]*?<td[^>]*>([\\s\\S]*?)<\\/td>[\\s\\S]*?<\\/tr>`, 'i'),
  ];

  for (const re of rowRegexes) {
    const m = html.match(re);
    if (!m) continue;

    const parts = m.slice(1).map(p => stripTags(p));
    const hasCodeFirst = parts[0].replace(/\s/g, '').includes(formatted.replace('-', ''));

    const cidade = hasCodeFirst ? parts[1] : parts[0];
    const morada = hasCodeFirst ? parts[2] : parts[2];

    if (morada || cidade) {
      return {
        morada,
        bairro: '',
        cidade,
        display_name: `${morada}${morada && cidade ? ', ' : ''}${cidade}`,
      };
    }
  }

  return null;
}

function tryParseCodigoPostalPage(html: string, formatted: string) {
  const compactCode = formatted.replace('-', '');
  const htmlHasCode =
    html.includes(formatted) ||
    html.includes(compactCode) ||
    new RegExp(`<span[^>]*class=["'][^"']*cp[^"']*["'][^>]*>\\s*${formatted}\\s*<\\/span>`, 'i').test(html);

  if (!htmlHasCode) return null;

  const morada =
    firstRegex(html, /<a[^>]*class=["'][^"']*search-title[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) ||
    firstRegex(html, /<h1[^>]*class=["'][^"']*search-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
    firstRegex(html, /<h1[^>]*>([\s\S]*?C[oó]digo\s*Postal[\s\S]*?)<\/h1>/i).replace(/^C[oó]digo\s*Postal\s*\d{4}-\d{3}\s*/i, '');

  const cpLineRaw = firstRegex(
    html,
    /<span[^>]*class=["'][^"']*cp[^"']*["'][^>]*>\s*\d{4}-\d{3}\s*<\/span>\s*([^<\r\n]+)/i
  );

  const localCsvRaw = firstRegex(html, /<span[^>]*class=["'][^"']*local[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  const localParts = localCsvRaw
    .split(',')
    .map(cleanupCsvPart)
    .filter(Boolean);

  const bairro = localParts[0] || '';
  const cidade = localParts[1] || cpLineRaw || localParts[0] || '';

  if (!morada && !bairro && !cidade) return null;

  return {
    morada,
    bairro,
    cidade,
    display_name: [morada, cidade].filter(Boolean).join(', '),
  };
}

async function fetchCodigoPostalScrape(formatted: string, cp4: string, cp3: string) {
  const urls = [
    `https://www.codigo-postal.pt/?cp4=${cp4}&cp3=${cp3}`,
    `https://www.codigo-postal.pt/${cp4}-${cp3}/`,
  ];

  for (const url of urls) {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'PrimeBussines/1.0 (postal-lookup)',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
      },
    });

    if (!res.ok) continue;
    const html = await res.text();

    const directParsed = tryParseCodigoPostalPage(html, formatted);
    if (directParsed) return directParsed;

    const structured = tryParseStructuredData(html, formatted);
    if (structured) return structured;

    const tableParsed = tryParseTable(html, formatted);
    if (tableParsed) return tableParsed;

    // heuristic fallback for visible blocks
    const morada = firstRegex(html, /(?:Rua|Avenida|Travessa|Praca|Largo|Estrada)[^<]{3,140}/i);
    const cidade = firstRegex(html, /<strong>\s*Localidade\s*:\s*<\/strong>\s*([^<]+)/i) ||
                   firstRegex(html, /<strong>\s*Concelho\s*:\s*<\/strong>\s*([^<]+)/i);

    if (morada || cidade) {
      return {
        morada,
        bairro: '',
        cidade,
        display_name: `${morada}${morada && cidade ? ', ' : ''}${cidade}`,
      };
    }
  }

  return null;
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const code = url.searchParams.get('code')?.trim() || '';
    const normalized = normalizePostalCode(code);

    if (!normalized) {
      return new Response(JSON.stringify({ error: 'codigo_postal_invalido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const found = await fetchCodigoPostalScrape(normalized.formatted, normalized.cp4, normalized.cp3);

    if (!found) {
      const payload: PostalLookupResponse = {
        found: false,
        codigo_postal: normalized.formatted,
        morada: '',
        bairro: '',
        cidade: '',
      };
      return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
    }

    const payload: PostalLookupResponse = {
      found: true,
      codigo_postal: normalized.formatted,
      morada: found.morada || '',
      bairro: found.bairro || '',
      cidade: found.cidade || '',
      display_name: found.display_name,
    };

    return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Postal code lookup error:', error);
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
