import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { calcPrecoVenda, normalizeMargem } from '../../../lib/settings';

export const GET: APIRoute = async () => {
  const sql = getDb();
  const servicos = await sql`SELECT * FROM servicos WHERE ativo = true ORDER BY nome`;
  return new Response(JSON.stringify(servicos), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, redirect }) => {
  try {
    const ct = request.headers.get('content-type') || '';
    let nome: string, descricao: string | null, custo: number, unidade: string, margem: number;
    if (ct.includes('application/json')) {
      const body = await request.json();
      nome = body.nome; descricao = body.descricao || null;
      custo = parseFloat(String(body.custo ?? body.preco ?? '0'));
      unidade = body.unidade || 'unidade';
      margem = normalizeMargem(body.margem_pct, 250);
    } else {
      const fd = await request.formData();
      nome = fd.get('nome')?.toString().trim() || '';
      descricao = fd.get('descricao')?.toString().trim() || null;
      custo = parseFloat((fd.get('custo')?.toString() || '0').replace(',', '.'));
      unidade = fd.get('unidade')?.toString().trim() || 'unidade';
      margem = normalizeMargem(fd.get('margem_pct')?.toString(), 250);
    }
    if (!nome || !Number.isFinite(custo) || custo <= 0) {
      if (ct.includes('application/json')) return new Response(JSON.stringify({ error: 'Nome e custo são obrigatórios' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      return redirect('/admin/servicos/novo?error=validation');
    }
    const preco = calcPrecoVenda(custo, margem);
    const sql = getDb();
    const [servico] = await sql`INSERT INTO servicos (nome, descricao, custo, preco, unidade, margem_pct) VALUES (${nome}, ${descricao}, ${custo}, ${preco}, ${unidade}, ${margem}) RETURNING *`;
    if (ct.includes('application/json')) return new Response(JSON.stringify(servico), { status: 201, headers: { 'Content-Type': 'application/json' } });
    return redirect('/admin/servicos?success=1');
  } catch (err) {
    return redirect('/admin/servicos/novo?error=server');
  }
};
