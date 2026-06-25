import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { buildOrcamentoPdf, loadOrcamento } from '../../../../lib/orcamentos';

function getBaseUrl(request: Request) {
  const configured = (import.meta.env.PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || '').trim();
  return (configured || new URL(request.url).origin).replace(/\/+$/, '');
}

export const GET: APIRoute = async ({ params, request }) => {
  const sql = getDb();
  const loaded = await loadOrcamento(sql, params.id!);
  if (!loaded) return new Response('Orçamento não encontrado', { status: 404 });

  const baseUrl = getBaseUrl(request);
  const pdf = await buildOrcamentoPdf(loaded.orc, loaded.itens, baseUrl);
  const numero = loaded.orc.numero || `ORC-${loaded.orc.id}`;

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${numero}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
};
