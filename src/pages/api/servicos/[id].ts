import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const { id } = params;
  const sql = getDb();
  const fd = await request.formData();
  const method = fd.get('_method')?.toString();

  if (method === 'DELETE') {
    try {
      await sql`DELETE FROM servicos WHERE id = ${id}`;
      return redirect('/admin/servicos?success=1');
    } catch {
      return redirect(`/admin/servicos/${id}?error=server`);
    }
  }

  if (method === 'PUT') {
    try {
      const nome     = fd.get('nome')?.toString().trim();
      const descricao= fd.get('descricao')?.toString().trim() || null;
      const preco    = parseFloat(fd.get('preco')?.toString() || '0');
      const unidade  = fd.get('unidade')?.toString().trim() || 'unidade';
      const ativo    = fd.get('ativo') === 'true';
      await sql`UPDATE servicos SET nome=${nome}, descricao=${descricao}, preco=${preco}, unidade=${unidade}, ativo=${ativo} WHERE id=${id}`;
      return redirect(`/admin/servicos/${id}?success=1`);
    } catch {
      return redirect(`/admin/servicos/${id}?error=server`);
    }
  }

  return new Response('Method not allowed', { status: 405 });
};
