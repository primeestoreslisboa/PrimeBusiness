import { getDb } from './db';

export type PaymentOptions = {
  allowCash: boolean;
  allowBankTransfer: boolean;
  bankIban: string;
  allowMbwayPhone: boolean;
  mbwayPhone: string;
};

export type BookingNotificationOptions = {
  emails: string[];
  whatsappNumbers: string[];
  whatsappCallmebotApiKey: string;
};

export type CompanyInfo = {
  nome: string;
  subtitulo: string;
  telefone: string;
  email: string;
  website: string;
  horario: string;
  iban: string;
  condicoes: string[];
};

export const COMPANY_DEFAULTS: CompanyInfo = {
  nome: 'Prime Estores',
  subtitulo: 'Instalação e Reparação de Estores',
  telefone: '+351 923 348 323',
  email: 'info@primeestores.pt',
  website: 'primeestores.pt',
  horario: 'Grande Lisboa · Seg–Sáb 8h–20h',
  iban: 'PT50 0033 0000 4556 0557 8820 5',
  condicoes: [
    'Validade do orçamento: 30 dias a contar da data de emissão.',
    'Pagamento: transferência bancária, MB Way ou numerário.',
    'Prazo de execução: a confirmar após aceitação do orçamento.',
    'Garantia: 1 ano em todos os trabalhos de instalação e reparação.',
    'Deslocação incluída em toda a Grande Lisboa, sem custos adicionais.',
    'Valores em euros (€). IVA incluído à taxa legal em vigor.',
  ],
};

export async function ensureSettingsTable() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

export async function getSetting(key: string, fallback = '') {
  await ensureSettingsTable();
  const sql = getDb();
  const [row] = await sql`SELECT value FROM app_settings WHERE key = ${key} LIMIT 1`;
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string) {
  await ensureSettingsTable();
  const sql = getDb();
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

export async function getSettingBool(key: string, fallback = false) {
  const value = await getSetting(key, fallback ? 'true' : 'false');
  return value === 'true';
}

export async function setSettingBool(key: string, value: boolean) {
  await setSetting(key, value ? 'true' : 'false');
}

export async function getAgendamentoIntervaloHoras(fallback = 3): Promise<number> {
  const raw = await getSetting('agendamento_intervalo_horas', String(fallback));
  const parsed = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  if (parsed > 12) return 12;
  return parsed;
}

export async function getIvaRate(fallback = 23): Promise<number> {
  const raw = await getSetting('iva_rate', String(fallback));
  const parsed = Number.parseFloat(String(raw).replace(',', '.'));
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
}

export async function getPaymentOptions(): Promise<PaymentOptions> {
  const [allowCash, allowBankTransfer, bankIban, allowMbwayPhone, mbwayPhone] = await Promise.all([
    getSettingBool('payment_cash_enabled', true),
    getSettingBool('payment_bank_transfer_enabled', false),
    getSetting('payment_bank_iban', ''),
    getSettingBool('payment_mbway_phone_enabled', false),
    getSetting('payment_mbway_phone', ''),
  ]);

  return {
    allowCash,
    allowBankTransfer,
    bankIban: bankIban.trim(),
    allowMbwayPhone,
    mbwayPhone: mbwayPhone.trim(),
  };
}

function parseMultiValueList(raw: string) {
  return raw
    .split(/[\n,;]+/g)
    .map(v => v.trim())
    .filter(Boolean);
}

export async function getBookingNotificationOptions(): Promise<BookingNotificationOptions> {
  const [emailsRaw, whatsappRaw, callmebotApiKeyRaw] = await Promise.all([
    getSetting('booking_notify_emails', ''),
    getSetting('booking_notify_whatsapp_numbers', ''),
    getSetting('booking_notify_whatsapp_callmebot_apikey', ''),
  ]);

  const emails = parseMultiValueList(emailsRaw).map(v => v.toLowerCase());
  const whatsappNumbers = parseMultiValueList(whatsappRaw).map(v => v.replace(/[^\d+]/g, ''));

  return {
    emails,
    whatsappNumbers,
    whatsappCallmebotApiKey: callmebotApiKeyRaw.trim(),
  };
}

export async function getCompanyInfo(): Promise<CompanyInfo> {
  const [nome, subtitulo, telefone, email, website, horario, iban, condicoesRaw] = await Promise.all([
    getSetting('empresa_nome', COMPANY_DEFAULTS.nome),
    getSetting('empresa_subtitulo', COMPANY_DEFAULTS.subtitulo),
    getSetting('empresa_telefone', COMPANY_DEFAULTS.telefone),
    getSetting('empresa_email', COMPANY_DEFAULTS.email),
    getSetting('empresa_website', COMPANY_DEFAULTS.website),
    getSetting('empresa_horario', COMPANY_DEFAULTS.horario),
    getSetting('empresa_iban', COMPANY_DEFAULTS.iban),
    getSetting('empresa_condicoes', ''),
  ]);

  const condicoes = condicoesRaw.trim()
    ? condicoesRaw.split(/\r?\n/g).map(l => l.trim()).filter(Boolean)
    : COMPANY_DEFAULTS.condicoes;

  return {
    nome: nome.trim() || COMPANY_DEFAULTS.nome,
    subtitulo: subtitulo.trim() || COMPANY_DEFAULTS.subtitulo,
    telefone: telefone.trim() || COMPANY_DEFAULTS.telefone,
    email: email.trim() || COMPANY_DEFAULTS.email,
    website: website.trim() || COMPANY_DEFAULTS.website,
    horario: horario.trim() || COMPANY_DEFAULTS.horario,
    iban: iban.trim() || COMPANY_DEFAULTS.iban,
    condicoes,
  };
}
