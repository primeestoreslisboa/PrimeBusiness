import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getIvaRate } from '../../../lib/settings';
import { buildNumero, computeTotals, genToken } from '../../../lib/orcamentos';

export type ParsedItem = { descricao: string; quantidade: number; preco_unitario: number; largura: number | null; altura: number | null; ordem: number };

export function parseItens(form: FormData): ParsedItem[] {
  const descs = form.getAll('item_desc');
  const qtds = form.getAll('item_qtd');
  const precos = form.getAll('item_preco');
  const largs = form.getAll('item_larg');
  const alts = form.getAll('item_alt');
  const parseDim = (v: FormDataEntryValue | undefined) => {
    const n = Number.parseFloat((v?.toString() || '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const itens: ParsedItem[] = [];
  for (let i = 0; i < descs.length; i++) {
    const descricao = (descs[i]?.toString() || '').trim();
    if (!descricao) continue;
    const largura = parseDim(largs[i]);
    const altura = parseDim(alts[i]);
    // A quantidade é sempre o nº de itens introduzido; em m² as medidas (L×A)
    // entram como fator de área no cálculo do total (ver computeTotals).
    const quantidade = Math.max(0, Number.parseFloat((qtds[i]?.toString() || '1').replace(',', '.')) || 1);
    const preco_unitario = Math.max(0, Number.parseFloat((precos[i]?.toString() || '0').replace(',', '.')) || 0);
    itens.push({ descricao, quantidade, preco_unitario, largura, altura, ordem: itens.length });
  }
  return itens;
}

export type ParsedFatura = { numero_fatura: string | null; fornecedor: string | null; data_compra: string | null; valor_total: number; ordem: number };

export function parseFaturas(form: FormData): ParsedFatura[] {
  const nums = form.getAll('fatura_numero');
  const forns = form.getAll('fatura_fornecedor');
  const datas = form.getAll('fatura_data');
  const valores = form.getAll('fatura_valor');
  const n = Math.max(nums.length, forns.length, datas.length, valores.length);
  const faturas: ParsedFatura[] = [];
  for (let i = 0; i < n; i++) {
    const numero_fatura = (nums[i]?.toString() || '').trim() || null;
    const fornecedor = (forns[i]?.toString() || '').trim() || null;
    const dataRaw = (datas[i]?.toString() || '').trim();
    const data_compra = dataRaw || null;
    const valor_total = Math.max(0, Number.parseFloat((valores[i]?.toString() || '0').replace(',', '.')) || 0);
    // Ignora linhas totalmente vazias.
    if (!numero_fatura && !fornecedor && !data_compra && valor_total === 0) continue;
    faturas.push({ numero_fatura, fornecedor, data_compra, valor_total, ordem: faturas.length });
  }
  return faturas;
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

    const descontoTipo = form.get('desconto_tipo')?.toString() === 'percent' ? 'percent' : 'valor';
    const descontoValor = Math.max(0, Number.parseFloat((form.get('desconto_valor')?.toString() || '0').replace(',', '.')) || 0);

    const itens = parseItens(form);
    const { subtotal, total } = computeTotals(itens, includeIva, ivaRate, descontoTipo, descontoValor);

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
        include_iva, iva_rate, desconto_tipo, desconto_valor, subtotal, total, status, public_token, created_by, chamado_id
      ) VALUES (
        ${cliente_nome}, ${cliente_nif}, ${cliente_morada}, ${cliente_codigo_postal}, ${cliente_localidade},
        ${cliente_telefone}, ${cliente_email}, ${validade_dias}, ${observacoes},
        ${includeIva}, ${ivaRate}, ${descontoTipo}, ${descontoValor}, ${subtotal}, ${total}, 'rascunho', ${token}, ${createdBy}, ${chamadoId}
      )
      RETURNING id, created_at
    `;

    const numero = buildNumero(orc.id, new Date(orc.created_at));
    await sql`UPDATE orcamentos_diretos SET numero = ${numero} WHERE id = ${orc.id}`;

    for (const it of itens) {
      await sql`
        INSERT INTO orcamento_direto_itens (orcamento_id, descricao, quantidade, preco_unitario, largura, altura, ordem)
        VALUES (${orc.id}, ${it.descricao}, ${it.quantidade}, ${it.preco_unitario}, ${it.largura}, ${it.altura}, ${it.ordem})
      `;
    }

    const faturas = parseFaturas(form);
    for (const f of faturas) {
      await sql`
        INSERT INTO orcamento_faturas (orcamento_id, numero_fatura, fornecedor, data_compra, valor_total, ordem)
        VALUES (${orc.id}, ${f.numero_fatura}, ${f.fornecedor}, ${f.data_compra}, ${f.valor_total}, ${f.ordem})
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
