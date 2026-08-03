import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { normalizeCategoria } from '../../../lib/despesas';

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export const POST: APIRoute = async ({ locals, request, redirect }) => {
  if ((locals.user as any)?.role !== 'admin') return redirect('/dashboard');
  const sql = getDb();
  try {
    const form = await request.formData();
    const descricao = (form.get('descricao')?.toString() || '').trim();
    const dataRaw = (form.get('data_despesa')?.toString() || '').trim();
    const valor = Math.max(0, Number.parseFloat((form.get('valor')?.toString() || '0').replace(',', '.')) || 0);
    if (!descricao || !isDate(dataRaw) || valor <= 0) {
      return redirect('/despesas?error=validation');
    }
    const fornecedor = form.get('fornecedor')?.toString().trim() || null;
    const numero_fatura = form.get('numero_fatura')?.toString().trim() || null;
    const categoria = normalizeCategoria(form.get('categoria')?.toString());
    const createdBy = (locals.user as any)?.userId ?? null;

    await sql`
      INSERT INTO despesas (data_despesa, descricao, fornecedor, numero_fatura, categoria, valor, created_by)
      VALUES (${dataRaw}, ${descricao}, ${fornecedor}, ${numero_fatura}, ${categoria}, ${valor}, ${createdBy})
    `;
    return redirect('/despesas?success=created');
  } catch (err) {
    console.error('Criar despesa error:', err);
    return redirect('/despesas?error=server');
  }
};
