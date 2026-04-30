import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';

function env(name: string) {
  return import.meta.env[name] || process.env[name];
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const requestId = url.searchParams.get('idpedido')?.trim() || url.searchParams.get('requestId')?.trim() || '';
    const reference = url.searchParams.get('referencia')?.trim() || url.searchParams.get('reference')?.trim() || '';
    const estado = (url.searchParams.get('estado')?.trim() || '').toUpperCase();
    const key = url.searchParams.get('chave')?.trim() || '';

    const expectedKey = env('MBWAY_CALLBACK_ANTI_PHISHING_KEY');
    if (expectedKey && key && key !== expectedKey) {
      return new Response('invalid-key', { status: 403 });
    }

    if (!requestId) {
      return new Response('missing-requestId', { status: 400 });
    }

    const sql = getDb();
    const paid = estado === 'PAGO' || estado === '000';
    const status = paid ? 'pago' : estado === 'REJEITADO' ? 'rejeitado' : 'pendente';

    await sql`
      UPDATE orcamentos
      SET
        mbway_reference = COALESCE(${reference || null}, mbway_reference),
        mbway_status = ${status},
        mbway_last_check_at = NOW(),
        mbway_paid_at = CASE WHEN ${paid} THEN COALESCE(mbway_paid_at, NOW()) ELSE mbway_paid_at END
      WHERE mbway_request_id = ${requestId}
    `;

    return new Response('ok', { status: 200 });
  } catch (error) {
    console.error('MB WAY callback error:', error);
    return new Response('error', { status: 500 });
  }
};
