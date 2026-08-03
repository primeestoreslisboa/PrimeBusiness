import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { normalizeCategoria } from '../../../lib/despesas';

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export const POST: APIRoute = async ({ locals, params, request, redirect }) => {
  if ((locals.user as any)?.role !== 'admin') return redirect('/dashboard');
  const { id } = params;
  const sql = getDb();
  try {
    const form = await request.formData();
    const action = form.get('action')?.toString();

    if (action === 'delete') {
      await sql`DELETE FROM despesas WHERE id = ${id}`;
      return redirect('/despesas?success=deleted');
    }

    const descricao = (form.get('descricao')?.toString() || '').trim();
    const dataRaw = (form.get('data_despesa')?.toString() || '').trim();
    const valor = Math.max(0, Number.parseFloat((form.get('valor')?.toString() || '0').replace(',', '.')) || 0);
    if (!descricao || !isDate(dataRaw) || valor <= 0) {
      return redirect('/despesas?error=validation');
    }
    const fornecedor = form.get('fornecedor')?.toString().trim() || null;
    const numero_fatura = form.get('numero_fatura')?.toString().trim() || null;
    const categoria = normalizeCategoria(form.get('categoria')?.toString());

    await sql`
      UPDATE despesas SET
        data_despesa=${dataRaw}, descricao=${descricao}, fornecedor=${fornecedor},
        numero_fatura=${numero_fatura}, categoria=${categoria}, valor=${valor}
      WHERE id=${id}
    `;
    return redirect('/despesas?success=updated');
  } catch (err) {
    console.error('Despesa action error:', err);
    return redirect('/despesas?error=server');
  }
};
