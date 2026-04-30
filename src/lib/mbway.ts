type MbWayCreateParams = {
  amount: number;
  phone: string;
  orderId: string;
};

type MbWayCreateResult = {
  requestId: string;
  reference?: string;
  raw: any;
};

type MbWayStatusResult = {
  code: string;
  description: string;
  paid: boolean;
  rejected: boolean;
  raw: any;
};

function env(name: string) {
  return import.meta.env[name] || process.env[name];
}

function getIfthenpayKey() {
  const key = env('MBWAY_IFTHENPAY_KEY');
  if (!key) throw new Error('MBWAY_IFTHENPAY_KEY nao definido');
  return key;
}

export function normalizePtMobile(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 9) return digits;
  if (digits.length === 12 && digits.startsWith('351')) return digits.slice(3);
  return digits;
}

function toFixedAmount(amount: number) {
  return amount.toFixed(2);
}

function getStringField(obj: any, candidates: string[]) {
  for (const key of candidates) {
    if (obj?.[key] !== undefined && obj?.[key] !== null && `${obj[key]}`.trim()) {
      return `${obj[key]}`.trim();
    }
  }
  return '';
}

export async function createMbWayPayment(params: MbWayCreateParams): Promise<MbWayCreateResult> {
  const apiUrl = env('MBWAY_IFTHENPAY_API_URL') || 'https://api.ifthenpay.com/spg/payment/mbway';
  const mbWayKey = getIfthenpayKey();
  const payload = {
    mbWayKey,
    orderId: params.orderId,
    amount: toFixedAmount(params.amount),
    mobileNumber: normalizePtMobile(params.phone),
  };

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();
  let parsed: any = {};
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsed = { rawText };
  }

  if (!res.ok) {
    throw new Error(`MB WAY create falhou (HTTP ${res.status})`);
  }

  const requestId = getStringField(parsed, ['requestId', 'RequestId', 'idPedido', 'IdPedido']);
  const reference = getStringField(parsed, ['reference', 'Referencia', 'referencia']);

  if (!requestId) {
    throw new Error('Resposta MB WAY sem requestId');
  }

  return { requestId, reference: reference || undefined, raw: parsed };
}

export async function getMbWayPaymentStatus(requestId: string): Promise<MbWayStatusResult> {
  const statusUrl = env('MBWAY_IFTHENPAY_STATUS_URL') || 'https://api.ifthenpay.com/spg/payment/mbway/status';
  const mbWayKey = getIfthenpayKey();

  const url = new URL(statusUrl);
  url.searchParams.set('mbWayKey', mbWayKey);
  url.searchParams.set('requestId', requestId);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const rawText = await res.text();
  let parsed: any = {};
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsed = { rawText };
  }

  if (!res.ok) {
    throw new Error(`MB WAY status falhou (HTTP ${res.status})`);
  }

  const code = getStringField(parsed, ['estado', 'Estado', 'status', 'Status', 'code', 'Code']) || 'unknown';
  const description = getStringField(parsed, ['msgDescricao', 'MsgDescricao', 'message', 'Message']) || code;

  return {
    code,
    description,
    paid: code === '000' || /^pago$/i.test(description),
    rejected: code === '020' || code === '048' || code === '122' || code === '125',
    raw: parsed,
  };
}
