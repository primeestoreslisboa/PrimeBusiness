import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { buildOrcamentoPdf, loadOrcamentoByToken } from '../../../lib/orcamentos';

function getBaseUrl(request: Request) {
  const configured = (import.meta.env.PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || '').trim();
  return (configured || new URL(request.url).origin).replace(/\/+$/, '');
}

export const GET: APIRoute = async ({ params, request }) => {
  const token = params.token?.toString() || '';
  if (!token) return new Response('Não encontrado', { status: 404 });

  const sql = getDb();
  const loaded = await loadOrcamentoByToken(sql, token);
  if (!loaded) return new Response('Orçamento não encontrado', { status: 404 });

  const baseUrl = getBaseUrl(request);
  const pdf = await buildOrcamentoPdf(loaded.orc, loaded.itens, baseUrl);
  const numero = loaded.orc.numero || `ORC-${loaded.orc.id}`;

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${numero}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
};
