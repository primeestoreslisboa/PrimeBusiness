/**
 * Encurta um URL usando serviços gratuitos (sem chave).
 * Tenta TinyURL e, em alternativa, is.gd. Se falhar, devolve o URL original.
 */
async function tryProvider(url: string, endpoint: string): Promise<string | null> {
  try {
    const res = await fetch(endpoint, { method: 'GET' });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    if (text.startsWith('http://') || text.startsWith('https://')) return text;
    return null;
  } catch {
    return null;
  }
}

export async function shortenUrl(longUrl: string): Promise<string> {
  // URLs locais não são acessíveis aos encurtadores — devolve o original.
  if (/localhost|127\.0\.0\.1/.test(longUrl)) return longUrl;
  const enc = encodeURIComponent(longUrl);
  const tiny = await tryProvider(longUrl, `https://tinyurl.com/api-create.php?url=${enc}`);
  if (tiny) return tiny;
  const isgd = await tryProvider(longUrl, `https://is.gd/create.php?format=simple&url=${enc}`);
  if (isgd) return isgd;
  return longUrl;
}
