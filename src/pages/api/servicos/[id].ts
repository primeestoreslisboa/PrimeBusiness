import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getMargemVenda, calcPrecoVenda } from '../../../lib/settings';

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const { id } = params;
  const sql = getDb();
  const fd = await request.formData();
  const method = fd.get('_method')?.toString();

  if (method === 'DELETE') {
    try {
      await sql`DELETE FROM servicos WHERE id = ${id}`;
      return redirect('/admin/servicos?success=deleted');
    } catch {
      // Em uso por histórico (FK) — desativa em vez de apagar.
      try {
        await sql`UPDATE servicos SET ativo = false WHERE id = ${id}`;
        return redirect('/admin/servicos?success=disabled');
      } catch {
        return redirect(`/admin/servicos/${id}?error=server`);
      }
    }
  }

  if (method === 'PUT') {
    try {
      const nome     = fd.get('nome')?.toString().trim();
      const descricao= fd.get('descricao')?.toString().trim() || null;
      const custo    = parseFloat((fd.get('custo')?.toString() || '0').replace(',', '.'));
      const unidade  = fd.get('unidade')?.toString().trim() || 'unidade';
      const ativo    = fd.get('ativo') === 'true';
      const margem   = await getMargemVenda(400);
      const preco    = calcPrecoVenda(custo, margem);
      await sql`UPDATE servicos SET nome=${nome}, descricao=${descricao}, custo=${custo}, preco=${preco}, unidade=${unidade}, ativo=${ativo} WHERE id=${id}`;
      return redirect(`/admin/servicos/${id}?success=1`);
    } catch {
      return redirect(`/admin/servicos/${id}?error=server`);
    }
  }

  return new Response('Method not allowed', { status: 405 });
};
