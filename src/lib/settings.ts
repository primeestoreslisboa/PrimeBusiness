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
