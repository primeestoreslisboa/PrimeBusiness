import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getIvaRate } from '../../../lib/settings';
import { buildNumero, computeTotals, genToken } from '../../../lib/orcamentos';

export type ParsedItem = { descricao: string; quantidade: number; preco_unitario: number; ordem: number };

export function parseItens(form: FormData): ParsedItem[] {
  const descs = form.getAll('item_desc');
  const qtds = form.getAll('item_qtd');
  const precos = form.getAll('item_preco');
  const itens: ParsedItem[] = [];
  for (let i = 0; i < descs.length; i++) {
    const descricao = (descs[i]?.toString() || '').trim();
    if (!descricao) continue;
    const quantidade = Math.max(0, Number.parseFloat((qtds[i]?.toString() || '1').replace(',', '.')) || 1);
    const preco_unitario = Math.max(0, Number.parseFloat((precos[i]?.toString() || '0').replace(',', '.')) || 0);
    itens.push({ descricao, quantidade, preco_unitario, ordem: itens.length });
  }
  return itens;
}

export function parseIncludeIva(raw: FormDataEntryValue | null | undefined) {
  if (raw == null) return false;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

export const POST: APIRoute = async ({ locals, request, redirect }) => {
  const sql = getDb();
  try {
    const form = await request.formData();

    const cliente_nome = (form.get('cliente_nome')?.toString() || '').trim();
    if (!cliente_nome) return redirect('/orcamentos/novo?error=validation');

    const cliente_nif = form.get('cliente_nif')?.toString().trim() || null;
    const cliente_morada = form.get('cliente_morada')?.toString().trim() || null;
    const cliente_codigo_postal = form.get('cliente_codigo_postal')?.toString().trim() || null;
    const cliente_localidade = form.get('cliente_localidade')?.toString().trim() || null;
    const cliente_telefone = form.get('cliente_telefone')?.toString().trim() || null;
    const cliente_email = form.get('cliente_email')?.toString().trim() || null;
    const observacoes = form.get('observacoes')?.toString().trim() || null;
    const validade_dias = Math.max(1, Number.parseInt(form.get('validade_dias')?.toString() || '30', 10) || 30);

    const includeIva = parseIncludeIva(form.get('include_iva'));
    const defaultIva = await getIvaRate(23);
    const ivaRate = includeIva ? defaultIva : 0;

    const itens = parseItens(form);
    const { subtotal, total } = computeTotals(itens, includeIva, ivaRate);

    const token = genToken();
    const createdBy = (locals.user as any)?.userId ?? null;

    // Associação opcional a um chamado em aberto (criação a partir da página do chamado).
    let chamadoId: number | null = null;
    const chamadoIdRaw = form.get('chamado_id')?.toString().trim();
    if (chamadoIdRaw) {
      const [chamado] = await sql`SELECT id, status FROM chamados WHERE id = ${chamadoIdRaw} LIMIT 1`;
      if (chamado && (chamado.status === 'pendente' || chamado.status === 'em_andamento')) {
        chamadoId = chamado.id;
      }
    }

    const [orc] = await sql`
      INSERT INTO orcamentos_diretos (
        cliente_nome, cliente_nif, cliente_morada, cliente_codigo_postal, cliente_localidade,
        cliente_telefone, cliente_email, validade_dias, observacoes,
        include_iva, iva_rate, subtotal, total, status, public_token, created_by, chamado_id
      ) VALUES (
        ${cliente_nome}, ${cliente_nif}, ${cliente_morada}, ${cliente_codigo_postal}, ${cliente_localidade},
        ${cliente_telefone}, ${cliente_email}, ${validade_dias}, ${observacoes},
        ${includeIva}, ${ivaRate}, ${subtotal}, ${total}, 'rascunho', ${token}, ${createdBy}, ${chamadoId}
      )
      RETURNING id, created_at
    `;

    const numero = buildNumero(orc.id, new Date(orc.created_at));
    await sql`UPDATE orcamentos_diretos SET numero = ${numero} WHERE id = ${orc.id}`;

    for (const it of itens) {
      await sql`
        INSERT INTO orcamento_direto_itens (orcamento_id, descricao, quantidade, preco_unitario, ordem)
        VALUES (${orc.id}, ${it.descricao}, ${it.quantidade}, ${it.preco_unitario}, ${it.ordem})
      `;
    }

    if (chamadoId) {
      return redirect(`/chamados/${chamadoId}?success=orcamento_associado`);
    }
    return redirect(`/orcamentos/${orc.id}/editar?success=created`);
  } catch (err) {
    console.error('Criar orcamento direto error:', err);
    return redirect('/orcamentos/novo?error=server');
  }
};
