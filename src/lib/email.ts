import nodemailer from 'nodemailer';
import type { PaymentOptions } from './settings';

function getTransporter() {
  const user = import.meta.env.EMAIL_USER || process.env.EMAIL_USER;
  const pass = import.meta.env.EMAIL_PASS || process.env.EMAIL_PASS;

  if (!user || !pass) {
    throw new Error('EMAIL_USER e EMAIL_PASS nao estao definidos no .env');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

function renderPaymentHtml(paymentOptions?: PaymentOptions) {
  const paymentLines: string[] = [];
  if (paymentOptions?.allowCash) paymentLines.push('<li>Dinheiro</li>');
  if (paymentOptions?.allowBankTransfer && paymentOptions.bankIban) {
    paymentLines.push(`<li>Transferencia bancaria (IBAN: <strong>${paymentOptions.bankIban}</strong>)</li>`);
  }
  if (paymentOptions?.allowMbwayPhone && paymentOptions.mbwayPhone) {
    paymentLines.push(`<li>MB WAY para o numero <strong>${paymentOptions.mbwayPhone}</strong></li>`);
  }

  if (paymentLines.length === 0) return '';

  return `
    <div style="margin: 18px 0; padding: 12px; border: 1px solid #e5e7eb; border-radius: 10px; background: #f8fafc;">
      <p style="margin: 0 0 8px 0; font-weight: 600; color: #1f2937;">Metodos de pagamento disponiveis:</p>
      <ul style="margin: 0; padding-left: 18px; color: #374151; font-size: 14px;">${paymentLines.join('')}</ul>
    </div>
  `;
}

function renderPaymentText(paymentOptions?: PaymentOptions) {
  const paymentTextParts: string[] = [];
  if (paymentOptions?.allowCash) paymentTextParts.push('- Dinheiro');
  if (paymentOptions?.allowBankTransfer && paymentOptions.bankIban) {
    paymentTextParts.push(`- Transferencia bancaria (IBAN: ${paymentOptions.bankIban})`);
  }
  if (paymentOptions?.allowMbwayPhone && paymentOptions.mbwayPhone) {
    paymentTextParts.push(`- MB WAY para ${paymentOptions.mbwayPhone}`);
  }

  if (paymentTextParts.length === 0) return '';
  return `\n\nMetodos de pagamento:\n${paymentTextParts.join('\n')}`;
}

export async function sendOrcamentoEmail(params: {
  toEmail: string;
  toName: string;
  orcamentoId: number;
  chamadoId: number;
  servicos: Array<{ nome: string; quantidade: number; preco_unitario: number; observacao?: string | null }>;
  total: number;
  includeIva?: boolean;
  ivaRate?: number;
  acceptanceUrl?: string;
  rejectionUrl?: string;
  empresa?: string;
  paymentOptions?: PaymentOptions;
}) {
  const {
    toEmail,
    toName,
    orcamentoId,
    chamadoId,
    servicos,
    total,
    includeIva = false,
    ivaRate = 0,
    acceptanceUrl,
    rejectionUrl,
    empresa = 'PrimeBussines',
    paymentOptions,
  } = params;
  const subtotal = includeIva && ivaRate > 0 ? total / (1 + ivaRate / 100) : total;
  const ivaValue = includeIva ? total - subtotal : 0;

  const servicosHtml = servicos
    .map(
      s => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">
        ${s.nome}
        ${s.observacao ? `<div style="margin-top: 4px; color: #6b7280; font-size: 12px;">${s.observacao}</div>` : ''}
      </td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${s.quantidade}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">EUR ${s.preco_unitario.toFixed(2)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">EUR ${(s.quantidade * s.preco_unitario).toFixed(2)}</td>
    </tr>
  `
    )
    .join('');

  const paymentHtml = renderPaymentHtml(paymentOptions);

  const fromUser = import.meta.env.EMAIL_USER || process.env.EMAIL_USER;
  const transporter = getTransporter();

  const info = await transporter.sendMail({
    from: `"${empresa}" <${fromUser}>`,
    to: toEmail,
    subject: `Orcamento #${orcamentoId} - ${empresa}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #8B1A1A;">Orcamento de Servico</h2>
        <p>Ola <strong>${toName}</strong>,</p>
        <p>Segue o orcamento #${orcamentoId} para o servico solicitado (Chamado #${chamadoId}):</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 8px; text-align: left;">Servico</th>
              <th style="padding: 8px; text-align: center;">Qtd</th>
              <th style="padding: 8px; text-align: right;">Preco Unit.</th>
              <th style="padding: 8px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>${servicosHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding: 12px 8px; text-align: right; font-weight: bold;">TOTAL</td>
              <td style="padding: 12px 8px; text-align: right; font-weight: bold; color: #8B1A1A;">EUR ${total.toFixed(2)}</td>
            </tr>
            ${includeIva ? `
            <tr>
              <td colspan="3" style="padding: 4px 8px; text-align: right; color: #6b7280;">Subtotal sem IVA</td>
              <td style="padding: 4px 8px; text-align: right; color: #6b7280;">EUR ${subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="3" style="padding: 4px 8px; text-align: right; color: #6b7280;">IVA (${ivaRate.toFixed(2)}%)</td>
              <td style="padding: 4px 8px; text-align: right; color: #6b7280;">EUR ${ivaValue.toFixed(2)}</td>
            </tr>
            ` : ''}
          </tfoot>
        </table>

        ${acceptanceUrl && rejectionUrl ? `
        <div style="margin: 20px 0;">
          <a href="${acceptanceUrl}" style="display: inline-block; background: #16a34a; color: #fff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;">
            Aceitar orcamento
          </a>
          <a href="${rejectionUrl}" style="display: inline-block; background: #dc2626; color: #fff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600; margin-left: 8px;">
            Rejeitar orcamento
          </a>
        </div>

        <p style="color: #6b7280; font-size: 13px;">Se os botoes nao funcionarem:</p>
        <p style="color: #6b7280; font-size: 13px;">Aceitar: <a href="${acceptanceUrl}">${acceptanceUrl}</a></p>
        <p style="color: #6b7280; font-size: 13px;">Rejeitar: <a href="${rejectionUrl}">${rejectionUrl}</a></p>
        ` : `
        <p style="color: #6b7280; font-size: 13px;">Este orcamento ja nao esta pendente e segue apenas para consulta.</p>
        `}
        ${paymentHtml}
        <p style="color: #6b7280; font-size: 14px;">Para mais informacoes, entre em contacto connosco.</p>
        <p><strong>${empresa}</strong></p>
      </div>
    `,
  });

  return info;
}

export function generateWhatsAppLink(
  telefone: string,
  chamadoId: number,
  servicos: Array<{ nome: string; quantidade: number; preco_unitario: number; observacao?: string | null }>,
  total: number,
  acceptanceUrl?: string,
  rejectionUrl?: string,
  paymentOptions?: PaymentOptions,
  includeIva?: boolean,
  ivaRate?: number
): string {
  const phone = telefone.replace(/\D/g, '');
  const linhas = servicos
    .map(s => `- ${s.nome} x${s.quantidade}: EUR ${(s.quantidade * s.preco_unitario).toFixed(2)}${s.observacao ? `\n  Descricao: ${s.observacao}` : ''}`)
    .join('\n');

  const decisionText = acceptanceUrl && rejectionUrl
    ? `\n\nAceitar: ${acceptanceUrl}\nRejeitar: ${rejectionUrl}`
    : acceptanceUrl
      ? `\n\nPara aceitar o orcamento: ${acceptanceUrl}`
      : '';

  const paymentText = renderPaymentText(paymentOptions);
  const subtotal = includeIva && ivaRate ? total / (1 + ivaRate / 100) : total;
  const ivaValue = includeIva && ivaRate ? total - subtotal : 0;
  const ivaText = includeIva && ivaRate
    ? `\nSubtotal: EUR ${subtotal.toFixed(2)}\nIVA (${ivaRate.toFixed(2)}%): EUR ${ivaValue.toFixed(2)}`
    : '';

  const message = encodeURIComponent(
    `Ola! Segue o orcamento do Chamado #${chamadoId}:\n\n${linhas}\n\n*TOTAL: EUR ${total.toFixed(2)}*${ivaText}${decisionText}${paymentText}\n\nPara mais informacoes, entre em contacto connosco.`
  );

  return `https://wa.me/${phone}?text=${message}`;
}

function formatDateTimePt(value?: string | null) {
  if (!value) return '-';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Europe/Lisbon',
  }).format(date);
}

export async function sendAgendamentoEmail(params: {
  toEmail: string;
  toName: string;
  chamadoId: number;
  horarioAgendado: string;
  morada: string;
  bairro?: string | null;
  cidade: string;
  codigoPostal?: string | null;
  descricao: string;
  empresa?: string;
}) {
  const {
    toEmail,
    toName,
    chamadoId,
    horarioAgendado,
    morada,
    bairro,
    cidade,
    codigoPostal,
    descricao,
    empresa = 'PrimeBussines',
  } = params;

  const fromUser = import.meta.env.EMAIL_USER || process.env.EMAIL_USER;
  const transporter = getTransporter();
  const horarioFmt = formatDateTimePt(horarioAgendado);
  const local = [morada, bairro, cidade, codigoPostal].filter(Boolean).join(', ');

  const info = await transporter.sendMail({
    from: `"${empresa}" <${fromUser}>`,
    to: toEmail,
    subject: `Confirmacao de Agendamento #${chamadoId} - ${empresa}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto;">
        <h2 style="color: #8B1A1A;">Agendamento confirmado</h2>
        <p>Ola <strong>${toName}</strong>,</p>
        <p>Recebemos o seu pedido e o chamado foi criado com sucesso.</p>
        <div style="margin: 18px 0; padding: 14px; border: 1px solid #e5e7eb; border-radius: 10px; background: #f8fafc;">
          <p style="margin: 0 0 8px 0;"><strong>Chamado:</strong> #${chamadoId}</p>
          <p style="margin: 0 0 8px 0;"><strong>Data e hora:</strong> ${horarioFmt}</p>
          <p style="margin: 0 0 8px 0;"><strong>Morada:</strong> ${local || '-'}</p>
          <p style="margin: 0;"><strong>Descricao:</strong> ${descricao}</p>
        </div>
        <p style="color: #6b7280; font-size: 14px;">Se precisar de alterar o agendamento, responda a este email ou contacte-nos.</p>
        <p><strong>${empresa}</strong></p>
      </div>
    `,
    text:
      `Ola ${toName},\n\n` +
      `Recebemos o seu pedido e o chamado foi criado com sucesso.\n\n` +
      `Chamado: #${chamadoId}\n` +
      `Data e hora: ${horarioFmt}\n` +
      `Morada: ${local || '-'}\n` +
      `Descricao: ${descricao}\n\n` +
      `Se precisar de alterar o agendamento, responda a este email ou contacte-nos.\n\n` +
      `${empresa}`,
  });

  return info;
}

export async function sendNovoAgendamentoInternoEmail(params: {
  toEmail: string;
  chamadoId: number;
  clienteNome: string;
  clienteTelefone: string;
  clienteEmail?: string | null;
  horarioAgendado: string;
  morada: string;
  bairro?: string | null;
  cidade: string;
  codigoPostal?: string | null;
  descricao: string;
  empresa?: string;
}) {
  const {
    toEmail,
    chamadoId,
    clienteNome,
    clienteTelefone,
    clienteEmail,
    horarioAgendado,
    morada,
    bairro,
    cidade,
    codigoPostal,
    descricao,
    empresa = 'PrimeBussines',
  } = params;

  const fromUser = import.meta.env.EMAIL_USER || process.env.EMAIL_USER;
  const transporter = getTransporter();
  const horarioFmt = formatDateTimePt(horarioAgendado);
  const local = [morada, bairro, cidade, codigoPostal].filter(Boolean).join(', ');

  return transporter.sendMail({
    from: `"${empresa}" <${fromUser}>`,
    to: toEmail,
    subject: `Novo agendamento recebido #${chamadoId}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto;">
        <h2 style="color: #8B1A1A;">Novo agendamento do site</h2>
        <div style="margin: 18px 0; padding: 14px; border: 1px solid #e5e7eb; border-radius: 10px; background: #f8fafc;">
          <p style="margin: 0 0 8px 0;"><strong>Chamado:</strong> #${chamadoId}</p>
          <p style="margin: 0 0 8px 0;"><strong>Cliente:</strong> ${clienteNome}</p>
          <p style="margin: 0 0 8px 0;"><strong>Telefone:</strong> ${clienteTelefone}</p>
          <p style="margin: 0 0 8px 0;"><strong>Email:</strong> ${clienteEmail || '-'}</p>
          <p style="margin: 0 0 8px 0;"><strong>Data e hora:</strong> ${horarioFmt}</p>
          <p style="margin: 0 0 8px 0;"><strong>Morada:</strong> ${local || '-'}</p>
          <p style="margin: 0;"><strong>Descricao:</strong> ${descricao}</p>
        </div>
      </div>
    `,
    text:
      `Novo agendamento do site\n\n` +
      `Chamado: #${chamadoId}\n` +
      `Cliente: ${clienteNome}\n` +
      `Telefone: ${clienteTelefone}\n` +
      `Email: ${clienteEmail || '-'}\n` +
      `Data e hora: ${horarioFmt}\n` +
      `Morada: ${local || '-'}\n` +
      `Descricao: ${descricao}\n`,
  });
}

export async function sendNovoAgendamentoWhatsAppCallmebot(params: {
  phone: string;
  apiKey: string;
  chamadoId: number;
  clienteNome: string;
  clienteTelefone: string;
  horarioAgendado: string;
  cidade: string;
  descricao: string;
}) {
  const { phone, apiKey, chamadoId, clienteNome, clienteTelefone, horarioAgendado, cidade, descricao } = params;
  if (!apiKey) return;

  const normalizedPhone = phone.replace(/[^\d]/g, '');
  if (!normalizedPhone) return;

  const horarioFmt = formatDateTimePt(horarioAgendado);
  const msg =
    `Novo agendamento #${chamadoId}\n` +
    `Cliente: ${clienteNome}\n` +
    `Telefone: ${clienteTelefone}\n` +
    `Horario: ${horarioFmt}\n` +
    `Cidade: ${cidade}\n` +
    `Descricao: ${descricao}`;

  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(normalizedPhone)}&text=${encodeURIComponent(msg)}&apikey=${encodeURIComponent(apiKey)}`;
  await fetch(url, { method: 'GET' });
}

