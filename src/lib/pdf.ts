import PDFDocument from 'pdfkit';
import type { CompanyInfo } from './settings';

export type OrcamentoItem = {
  descricao: string;
  quantidade: number;
  preco_unitario: number;
};

export type OrcamentoPdfData = {
  numero: string;
  data: Date;
  validadeDias: number;
  cliente: {
    nome: string;
    nif?: string | null;
    morada?: string | null;
    codigoPostal?: string | null;
    localidade?: string | null;
    telefone?: string | null;
    email?: string | null;
  };
  itens: OrcamentoItem[];
  includeIva: boolean;
  ivaRate: number;
  descontoTipo?: string;
  descontoValor?: number;
  observacoes?: string | null;
};

// Paleta retirada do template DOCX
const RED = '#8B1A1A';
const GRAY_TEXT = '#6B6B6B';
const GRAY_FILL = '#F2F2F2';
const BORDER = '#CCCCCC';
const DARK = '#1F2937';

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function fmtDate(d: Date) {
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${pad(d.getDate())} / ${pad(d.getMonth() + 1)} / ${d.getFullYear()}`;
}

/**
 * Higieniza texto livre para as fontes standard do pdfkit (Helvetica / WinAnsi).
 * Estas fontes so suportam Latin-1 (CP1252); caracteres fora disso -- ou um
 * '\r' de uma quebra de linha do Windows -- aparecem como glifos lixo (ex.: "D").
 * Normaliza quebras de linha, converte pontuacao tipografica para ASCII e
 * remove tudo o que a fonte nao consegue representar.
 */
function pdfText(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/\r\n?/g, '\n')                        // CRLF / CR -> LF
    .replace(/[–—−]/g, '-')          // en/em dash, sinal de menos -> -
    .replace(/[‘’‚′]/g, "'")    // aspas simples curvas / prime -> '
    .replace(/[“”„″]/g, '"')    // aspas duplas curvas / double prime -> "
    .replace(/…/g, '...')                      // reticencias -> ...
    .replace(/[•●▪·]/g, '-')    // bullets / ponto medio -> -
    .replace(/ /g, ' ')                        // espaco nao-quebravel -> espaco
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')   // controlo (mantem \t e \n)
    .replace(/[^\x09\x0A\x20-\xFF]/g, '');          // fora de Latin-1 -> removido
}

function computeTotals(data: OrcamentoPdfData) {
  const subtotal = data.itens.reduce((acc, it) => acc + it.quantidade * it.preco_unitario, 0);
  let desconto = data.descontoTipo === 'percent' ? subtotal * ((data.descontoValor || 0) / 100) : (data.descontoValor || 0);
  if (!Number.isFinite(desconto) || desconto < 0) desconto = 0;
  if (desconto > subtotal) desconto = subtotal;
  const base = subtotal - desconto;
  const ivaValue = data.includeIva && data.ivaRate > 0 ? base * (data.ivaRate / 100) : 0;
  const total = base + ivaValue;
  return { subtotal, desconto, base, ivaValue, total };
}

/**
 * Gera o PDF do orçamento com o layout do template Prime Estores.
 * @param logo Buffer do logótipo (PNG) ou null se indisponível.
 */
export function generateOrcamentoPdf(
  data: OrcamentoPdfData,
  company: CompanyInfo,
  logo: Buffer | null,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      const contentWidth = right - left;

      // ---------- CABEÇALHO ----------
      const headerTop = 40;
      let logoW = 0;
      if (logo) {
        try {
          doc.image(logo, left, headerTop, { fit: [56, 56] });
          logoW = 68;
        } catch {
          logoW = 0;
        }
      }
      doc
        .font('Helvetica-Bold')
        .fontSize(20)
        .fillColor(RED)
        .text(company.nome.toUpperCase(), left + logoW, headerTop + 2, { width: 260 });
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(GRAY_TEXT)
        .text(company.subtitulo, left + logoW, headerTop + 26, { width: 260 });

      // Contactos (alinhados à direita)
      doc.font('Helvetica').fontSize(9).fillColor(DARK);
      const contactLines = [company.telefone, company.email, company.website, company.horario].filter(Boolean);
      doc.text(contactLines.join('\n'), right - 240, headerTop + 2, { width: 240, align: 'right' });

      // Linha divisória vermelha
      const dividerY = headerTop + 70;
      doc.moveTo(left, dividerY).lineTo(right, dividerY).lineWidth(2).strokeColor(RED).stroke();

      // ---------- TÍTULO ORÇAMENTO ----------
      let y = dividerY + 16;
      doc.font('Helvetica-Bold').fontSize(22).fillColor(DARK).text('ORÇAMENTO', left, y);
      doc.font('Helvetica').fontSize(9).fillColor(GRAY_TEXT).text('Proposta de serviço sem compromisso', left, y + 26);

      // Meta (Nº / Data / Validade) à direita
      const metaX = right - 220;
      doc.font('Helvetica').fontSize(9).fillColor(DARK);
      doc.text(`N.º do orçamento:  ${data.numero}`, metaX, y, { width: 220, align: 'right' });
      doc.text(`Data:  ${fmtDate(data.data)}`, metaX, y + 13, { width: 220, align: 'right' });
      doc.text(`Validade:  ${data.validadeDias} dias`, metaX, y + 26, { width: 220, align: 'right' });

      y += 50;

      // ---------- helper de cabeçalho de secção ----------
      const sectionHeader = (label: string, atY: number) => {
        doc.rect(left, atY, contentWidth, 18).fill(RED);
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF').text(label, left + 8, atY + 4);
        doc.fillColor(DARK);
        return atY + 18;
      };

      // ---------- DADOS DO CLIENTE ----------
      y = sectionHeader('DADOS DO CLIENTE', y);
      const c = data.cliente;
      const rows: Array<[string, string, string, string]> = [
        ['Nome / Empresa', pdfText(c.nome) || '-', 'NIF / Contribuinte', pdfText(c.nif) || '-'],
        ['Morada', pdfText(c.morada) || '-', 'Cód. Postal / Localidade', [pdfText(c.codigoPostal), pdfText(c.localidade)].filter(Boolean).join(' ') || '-'],
        ['Telefone', pdfText(c.telefone) || '-', 'Email', pdfText(c.email) || '-'],
      ];
      const rowH = 22;
      const colW = contentWidth / 2;
      rows.forEach((r, i) => {
        const ry = y + i * rowH;
        doc.rect(left, ry, contentWidth, rowH).strokeColor(BORDER).lineWidth(0.5).stroke();
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GRAY_TEXT).text(r[0], left + 6, ry + 3, { width: colW - 12 });
        doc.font('Helvetica').fontSize(9.5).fillColor(DARK).text(r[1], left + 6, ry + 11, { width: colW - 12 });
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GRAY_TEXT).text(r[2], left + colW + 6, ry + 3, { width: colW - 12 });
        doc.font('Helvetica').fontSize(9.5).fillColor(DARK).text(r[3], left + colW + 6, ry + 11, { width: colW - 12 });
      });
      y += rows.length * rowH + 14;

      // ---------- PEÇAS E SERVIÇOS ----------
      y = sectionHeader('PEÇAS E SERVIÇOS', y);

      // Colunas: # | Descrição | Qtd | Preço Unit | Total
      const cNum = 26;
      const cQtd = 50;
      const cUnit = 90;
      const cTot = 90;
      const cDesc = contentWidth - cNum - cQtd - cUnit - cTot;
      const xNum = left;
      const xDesc = xNum + cNum;
      const xQtd = xDesc + cDesc;
      const xUnit = xQtd + cQtd;
      const xTot = xUnit + cUnit;

      const thH = 18;
      doc.rect(left, y, contentWidth, thH).fill(GRAY_FILL);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(DARK);
      doc.text('#', xNum + 4, y + 5, { width: cNum - 6 });
      doc.text('Descrição da peça / serviço', xDesc + 4, y + 5, { width: cDesc - 8 });
      doc.text('Qtd.', xQtd, y + 5, { width: cQtd - 4, align: 'center' });
      doc.text('Preço Unit. (€)', xUnit, y + 5, { width: cUnit - 6, align: 'right' });
      doc.text('Total (€)', xTot, y + 5, { width: cTot - 6, align: 'right' });
      y += thH;

      doc.font('Helvetica').fontSize(9).fillColor(DARK);
      const minRows = Math.max(data.itens.length, 4);
      for (let i = 0; i < minRows; i++) {
        const it = data.itens[i];
        const desc = pdfText(it?.descricao);
        const descHeight = it ? doc.heightOfString(desc, { width: cDesc - 8 }) : 0;
        const lineH = Math.max(20, descHeight + 8);

        // quebra de página se necessário
        if (y + lineH > doc.page.height - 80) {
          doc.addPage();
          y = 40;
        }

        doc.rect(left, y, contentWidth, lineH).strokeColor(BORDER).lineWidth(0.5).stroke();
        if (it) {
          const lineTotal = it.quantidade * it.preco_unitario;
          doc.fillColor(DARK).font('Helvetica');
          doc.text(String(i + 1), xNum + 4, y + 5, { width: cNum - 6 });
          doc.text(desc, xDesc + 4, y + 5, { width: cDesc - 8 });
          doc.text(String(it.quantidade), xQtd, y + 5, { width: cQtd - 4, align: 'center' });
          doc.text(eur(it.preco_unitario), xUnit, y + 5, { width: cUnit - 6, align: 'right' });
          doc.text(eur(lineTotal), xTot, y + 5, { width: cTot - 6, align: 'right' });
        } else {
          doc.fillColor(GRAY_TEXT).text(String(i + 1), xNum + 4, y + 5, { width: cNum - 6 });
        }
        // separadores verticais
        doc.strokeColor(BORDER).lineWidth(0.5);
        [xDesc, xQtd, xUnit, xTot].forEach(xv => doc.moveTo(xv, y).lineTo(xv, y + lineH).stroke());
        y += lineH;
      }

      // ---------- TOTAIS ----------
      const { subtotal, desconto, ivaValue, total } = computeTotals(data);
      y += 8;
      const totBoxW = 230;
      const totX = right - totBoxW;
      const totRow = (label: string, value: string, bold = false, atY = y) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9.5).fillColor(bold ? RED : DARK);
        doc.text(label, totX, atY, { width: totBoxW - 90 });
        doc.text(`${value} €`, totX + totBoxW - 90, atY, { width: 90, align: 'right' });
      };
      totRow('Subtotal', eur(subtotal), false, y);
      y += 16;
      if (desconto > 0) {
        const descLabel = data.descontoTipo === 'percent'
          ? `Desconto (${(data.descontoValor || 0).toFixed(0)}%)`
          : 'Desconto';
        totRow(descLabel, `- ${eur(desconto)}`, false, y);
        y += 16;
      }
      totRow(`IVA (${data.ivaRate.toFixed(0)}%)`, eur(ivaValue), false, y);
      y += 18;
      doc.moveTo(totX, y).lineTo(right, y).lineWidth(1).strokeColor(RED).stroke();
      y += 4;
      totRow('TOTAL', eur(total), true, y);
      y += 26;

      // ---------- CONDIÇÕES ----------
      if (y > doc.page.height - 180) {
        doc.addPage();
        y = 40;
      }
      y = sectionHeader('CONDIÇÕES', y) + 6;
      doc.font('Helvetica').fontSize(8.5).fillColor(DARK);
      const ibanLine = `Pagamento: transferência bancária, MB Way ou numerário. IBAN: ${company.iban}.`;
      const condicoes = company.condicoes.map(l =>
        l.toLowerCase().startsWith('pagamento') ? ibanLine : l,
      );
      condicoes.forEach(line => {
        doc.text(`•  ${pdfText(line)}`, left, y, { width: contentWidth });
        y = doc.y + 2;
      });

      // ---------- OBSERVAÇÕES ----------
      if (data.observacoes && data.observacoes.trim()) {
        y += 10;
        if (y > doc.page.height - 120) {
          doc.addPage();
          y = 40;
        }
        y = sectionHeader('OBSERVAÇÕES', y) + 6;
        doc.font('Helvetica').fontSize(9).fillColor(DARK).text(pdfText(data.observacoes).trim(), left, y, { width: contentWidth });
      }

      // ---------- RODAPÉ ----------
      const footer = [company.nome, 'Grande Lisboa', company.telefone, company.email, company.website]
        .filter(Boolean)
        .join('  ·  ');
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        // Anular temporariamente a margem inferior para o rodapé não forçar nova página.
        const prevBottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.font('Helvetica').fontSize(7.5).fillColor(GRAY_TEXT);
        doc.text(footer, left, doc.page.height - 28, { width: contentWidth, align: 'center', lineBreak: false });
        doc.page.margins.bottom = prevBottom;
      }
      doc.flushPages();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
