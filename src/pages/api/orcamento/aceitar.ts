import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';

type Decisao = 'aprovar' | 'rejeitar';

function normalizeDecisao(value: string | null): Decisao | null {
  if (value === 'aprovar' || value === 'rejeitar') return value;
  return null;
}

async function processDecision(token: string, decisao: Decisao) {
  const sql = getDb();

  const [orcamento] = await sql`
    SELECT id, chamado_id, status
    FROM orcamentos
    WHERE aceite_token = ${token}
    LIMIT 1
  `;

  if (!orcamento) {
    return { ok: false as const, status: 'invalid' };
  }

  // Depois de finalizado, nunca mais pode alterar por link.
  if (orcamento.status === 'aprovado') {
    return { ok: true as const, status: 'already_approved' };
  }
  if (orcamento.status === 'concluido' || orcamento.status === 'rejeitado') {
    return { ok: true as const, status: 'already_rejected' };
  }

  if (decisao === 'aprovar') {
    const updated = await sql`
      UPDATE orcamentos
      SET status = 'aprovado', aceite_at = COALESCE(aceite_at, NOW())
      WHERE id = ${orcamento.id} AND status IN ('pendente', 'enviado')
      RETURNING id
    `;
    if (updated.length === 0) {
      const [current] = await sql`SELECT status FROM orcamentos WHERE id = ${orcamento.id}`;
      if (current?.status === 'aprovado') return { ok: true as const, status: 'already_approved' };
      return { ok: true as const, status: 'already_rejected' };
    }

    await sql`
      UPDATE chamados
      SET status = 'em_andamento', updated_at = NOW()
      WHERE id = ${orcamento.chamado_id}
    `;

    return { ok: true as const, status: 'approved' };
  }

  const updated = await sql`
    UPDATE orcamentos
    SET status = 'concluido'
    WHERE id = ${orcamento.id} AND status IN ('pendente', 'enviado')
    RETURNING id
  `;
  if (updated.length === 0) {
    const [current] = await sql`SELECT status FROM orcamentos WHERE id = ${orcamento.id}`;
    if (current?.status === 'aprovado') return { ok: true as const, status: 'already_approved' };
    return { ok: true as const, status: 'already_rejected' };
  }

  return { ok: true as const, status: 'rejected' };
}

export const GET: APIRoute = async ({ url, redirect }) => {
  try {
    const token = url.searchParams.get('token')?.trim() || '';
    const decisao = normalizeDecisao(url.searchParams.get('decisao'));

    if (!token || !decisao) return redirect('/orcamento/aceitar?status=invalid');

    const result = await processDecision(token, decisao);
    if (!result.ok) return redirect('/orcamento/aceitar?status=invalid');

    return redirect(`/orcamento/aceitar?token=${encodeURIComponent(token)}&status=${result.status}`);
  } catch (error) {
    console.error('Aceite/rejeicao orcamento error:', error);
    return redirect('/orcamento/aceitar?status=error');
  }
};

export const POST: APIRoute = async ({ request, redirect }) => {
  try {
    const form = await request.formData();
    const token = form.get('token')?.toString().trim() || '';
    const decisao = normalizeDecisao(form.get('decisao')?.toString() || null);

    if (!token || !decisao) return redirect('/orcamento/aceitar?status=invalid');

    const result = await processDecision(token, decisao);
    if (!result.ok) return redirect('/orcamento/aceitar?status=invalid');

    return redirect(`/orcamento/aceitar?token=${encodeURIComponent(token)}&status=${result.status}`);
  } catch (error) {
    console.error('Aceite/rejeicao orcamento error:', error);
    return redirect('/orcamento/aceitar?status=error');
  }
};
