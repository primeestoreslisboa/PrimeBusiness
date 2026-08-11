import { randomBytes } from 'node:crypto';
import { getCompanyInfo, type CompanyInfo } from './settings';
import { generateOrcamentoPdf, type OrcamentoPdfData } from './pdf';
import { LOGO_BUFFER } from './logo-data';

export type OrcamentoDiretoRow = {
  id: number;
  numero: string | null;
  cliente_nome: string;
  cliente_nif: string | null;
  cliente_morada: string | null;
  cliente_codigo_postal: string | null;
  cliente_localidade: string | null;
  cliente_telefone: string | null;
  cliente_email: string | null;
  validade_dias: number;
  observacoes: string | null;
  include_iva: boolean;
  iva_rate: string | number;
  subtotal: string | number;
  total: string | number;
  desconto_tipo: string | null;
  desconto_valor: string | number | null;
  status: string;
  public_token: string | null;
  enviado_via: string | null;
  enviado_at: string | null;
  chamado_id: number | null;
  created_at: string;
  updated_at: string;
};

export type OrcamentoItemRow = {
  id: number;
  orcamento_id: number;
  descricao: string;
  quantidade: string | number;
  preco_unitario: string | number;
  largura: string | number | null;
  altura: string | number | null;
  ordem: number;
};

export type OrcamentoFaturaRow = {
  id: number;
  orcamento_id: number;
  numero_fatura: string | null;
  fornecedor: string | null;
  data_compra: string | null;
  valor_total: string | number | null;
  ordem: number;
};

const CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // sem caracteres ambíguos
export function genToken() {
  const bytes = randomBytes(10);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s;
}

export function buildNumero(id: number, date: Date) {
  return `ORC-${date.getFullYear()}-${String(id).padStart(4, '0')}`;
}

export function num(v: string | number | null | undefined): number {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? '0').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Fator de área: em m² (largura×altura) multiplica o preço; caso contrário 1. */
export function areaFactor(largura: string | number | null | undefined, altura: string | number | null | undefined): number {
  const l = num(largura);
  const a = num(altura);
  return l > 0 && a > 0 ? l * a : 1;
}

export function computeTotals(
  itens: Array<{ quantidade: number; preco_unitario: number; largura?: string | number | null; altura?: string | number | null }>,
  includeIva: boolean,
  ivaRate: number,
  descontoTipo: string = 'valor',
  descontoValorRaw: number = 0,
) {
  const subtotal = itens.reduce((acc, it) => acc + it.quantidade * areaFactor(it.largura, it.altura) * it.preco_unitario, 0);
  // Desconto sempre sobre o valor sem IVA (subtotal).
  let desconto = descontoTipo === 'percent' ? subtotal * (descontoValorRaw / 100) : descontoValorRaw;
  if (!Number.isFinite(desconto) || desconto < 0) desconto = 0;
  if (desconto > subtotal) desconto = subtotal;
  const base = subtotal - desconto;
  const ivaValue = includeIva && ivaRate > 0 ? base * (ivaRate / 100) : 0;
  const total = base + ivaValue;
  return { subtotal, desconto, base, ivaValue, total };
}

export async function loadOrcamento(sql: any, id: string | number) {
  const [orc] = await sql`SELECT * FROM orcamentos_diretos WHERE id = ${id} LIMIT 1`;
  if (!orc) return null;
  const itens = await sql`
    SELECT * FROM orcamento_direto_itens WHERE orcamento_id = ${id} ORDER BY ordem ASC, id ASC
  `;
  const faturas = await sql`
    SELECT * FROM orcamento_faturas WHERE orcamento_id = ${id} ORDER BY ordem ASC, id ASC
  `;
  return { orc: orc as OrcamentoDiretoRow, itens: itens as OrcamentoItemRow[], faturas: faturas as OrcamentoFaturaRow[] };
}

export async function loadOrcamentoByToken(sql: any, token: string) {
  const [orc] = await sql`SELECT * FROM orcamentos_diretos WHERE public_token = ${token} LIMIT 1`;
  if (!orc) return null;
  const itens = await sql`
    SELECT * FROM orcamento_direto_itens WHERE orcamento_id = ${orc.id} ORDER BY ordem ASC, id ASC
  `;
  return { orc: orc as OrcamentoDiretoRow, itens: itens as OrcamentoItemRow[] };
}

export function isLocked(status: string | null | undefined) {
  return status === 'aprovado' || status === 'rejeitado';
}

/** Carrega o logótipo a partir da pasta public (servido em /logo-prime.png). */
export async function fetchLogoBuffer(baseUrl: string): Promise<Buffer | null> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/logo-prime.png`);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

export async function buildOrcamentoPdf(
  orc: OrcamentoDiretoRow,
  itens: OrcamentoItemRow[],
  baseUrl: string,
  company?: CompanyInfo,
): Promise<Buffer> {
  const companyInfo = company ?? (await getCompanyInfo());
  // Logo embebido (base64) — não depende de HTTP nem de estar publicado.
  const logo: Buffer | null = LOGO_BUFFER ?? (await fetchLogoBuffer(baseUrl));

  const data: OrcamentoPdfData = {
    numero: orc.numero || buildNumero(orc.id, new Date(orc.created_at)),
    data: new Date(orc.created_at),
    validadeDias: orc.validade_dias ?? 30,
    cliente: {
      nome: orc.cliente_nome,
      nif: orc.cliente_nif,
      morada: orc.cliente_morada,
      codigoPostal: orc.cliente_codigo_postal,
      localidade: orc.cliente_localidade,
      telefone: orc.cliente_telefone,
      email: orc.cliente_email,
    },
    itens: itens.map(it => {
      const larg = num(it.largura);
      const alt = num(it.altura);
      const medidas = larg > 0 && alt > 0
        ? ` (${larg.toLocaleString('pt-PT')} × ${alt.toLocaleString('pt-PT')} m)`
        : '';
      return {
        descricao: `${it.descricao}${medidas}`,
        quantidade: num(it.quantidade),
        preco_unitario: num(it.preco_unitario),
        largura: larg > 0 ? larg : null,
        altura: alt > 0 ? alt : null,
      };
    }),
    includeIva: !!orc.include_iva,
    ivaRate: num(orc.iva_rate),
    descontoTipo: orc.desconto_tipo || 'valor',
    descontoValor: num(orc.desconto_valor),
    observacoes: orc.observacoes,
  };

  return generateOrcamentoPdf(data, companyInfo, logo);
}
