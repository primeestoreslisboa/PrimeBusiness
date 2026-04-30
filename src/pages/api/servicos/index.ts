import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';

export const GET: APIRoute = async () => {
  const sql = getDb();
  const servicos = await sql`SELECT * FROM servicos WHERE ativo = true ORDER BY nome`;
  return new Response(JSON.stringify(servicos), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, redirect }) => {
  try {
    const ct = request.headers.get('content-type') || '';
    let nome: string, descricao: string | null, preco: number, unidade: string;
    if (ct.includes('application/json')) {
      const body = await request.json();
      nome = body.nome; descricao = body.descricao || null; preco = body.preco; unidade = body.unidade || 'unidade';
    } else {
      const fd = await request.formData();
      nome = fd.get('nome')?.toString().trim() || '';
      descricao = fd.get('descricao')?.toString().trim() || null;
      preco = parseFloat(fd.get('preco')?.toString() || '0');
      unidade = fd.get('unidade')?.toString().trim() || 'unidade';
    }
    if (!nome || !preco) {
      if (ct.includes('application/json')) return new Response(JSON.stringify({ error: 'Nome e preço são obrigatórios' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      return redirect('/admin/servicos/novo?error=validation');
    }
    const sql = getDb();
    const [servico] = await sql`INSERT INTO servicos (nome, descricao, preco, unidade) VALUES (${nome}, ${descricao}, ${preco}, ${unidade}) RETURNING *`;
    if (ct.includes('application/json')) return new Response(JSON.stringify(servico), { status: 201, headers: { 'Content-Type': 'application/json' } });
    return redirect('/admin/servicos?success=1');
  } catch (err) {
    return redirect('/admin/servicos/novo?error=server');
  }
};
