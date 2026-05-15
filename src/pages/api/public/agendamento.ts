import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { sendAgendamentoEmail, sendNovoAgendamentoInternoEmail, sendNovoAgendamentoWhatsAppCallmebot } from '../../../lib/email';
import { getBookingNotificationOptions } from '../../../lib/settings';

export const prerender = false;

const SLOT_START_HOUR = 8;
const SLOT_END_HOUR = 20;
const SLOT_DURATION_HOURS = 3;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function normalizeDateTime(value: string) {
  const v = value.trim().slice(0, 16);
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour < SLOT_START_HOUR || hour > SLOT_END_HOUR - SLOT_DURATION_HOURS) return null;
  if ((hour - SLOT_START_HOUR) % SLOT_DURATION_HOURS !== 0) return null;
  if (minute !== 0) return null;
  return v;
}

function normalizePhone(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export const OPTIONS: APIRoute = async () =>
  new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });

export const GET: APIRoute = async ({ url }) => {
  try {
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '14', 10), 1), 30);
    const sql = getDb();

    const rows = await sql`
      WITH days AS (
        SELECT generate_series(current_date, current_date + (${days}::int - 1) * interval '1 day', interval '1 day') AS d
      ),
      slots AS (
        SELECT (d + make_interval(hours => h))::timestamp AS slot_at
        FROM days, generate_series(${SLOT_START_HOUR}, ${SLOT_END_HOUR - SLOT_DURATION_HOURS}, ${SLOT_DURATION_HOURS}) AS h
        WHERE extract(isodow from d) BETWEEN 1 AND 5
      )
      SELECT
        to_char(s.slot_at, 'YYYY-MM-DD"T"HH24:MI') AS slot,
        to_char(s.slot_at + make_interval(hours => ${SLOT_DURATION_HOURS}), 'YYYY-MM-DD"T"HH24:MI') AS slot_end,
        to_char(s.slot_at, 'HH24:MI') || ' as ' || to_char(s.slot_at + make_interval(hours => ${SLOT_DURATION_HOURS}), 'HH24:MI') AS slot_range
      FROM slots s
      WHERE NOT EXISTS (
        SELECT 1
        FROM chamados c
        WHERE c.status NOT IN ('concluido', 'cancelado')
          AND c.horario_agendado < (s.slot_at + make_interval(hours => ${SLOT_DURATION_HOURS}))
          AND (c.horario_agendado + make_interval(hours => ${SLOT_DURATION_HOURS})) > s.slot_at
      )
        AND s.slot_at >= (now() + interval '1 hour')
      ORDER BY s.slot_at ASC
    `;

    return json({
      slots: rows.map((r: any) => r.slot),
      slotRanges: rows.map((r: any) => ({
        value: r.slot,
        start: r.slot,
        end: r.slot_end,
        label: r.slot_range,
      })),
    });
  } catch (error) {
    console.error('Public disponibilidade error:', error);
    return json({ ok: false, error: 'server' }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    let payload: any = {};

    if (contentType.includes('application/json')) {
      payload = await request.json();
    } else {
      const form = await request.formData();
      payload = Object.fromEntries(form.entries());
    }

    const nome = `${payload.nome || ''}`.trim();
    const telefone = normalizePhone(`${payload.telefone || ''}`);
    const emailRaw = `${payload.email || ''}`.trim();
    const email = emailRaw || null;
    const descricao = `${payload.descricao || ''}`.trim();
    const horarioAgendadoRaw = `${payload.horario_agendado || ''}`;
    const horario_agendado = normalizeDateTime(horarioAgendadoRaw);

    const morada = `${payload.morada || 'A confirmar'}`.trim() || 'A confirmar';
    const bairroRaw = `${payload.bairro || ''}`.trim();
    const bairro = bairroRaw || null;
    const cidade = `${payload.cidade || 'A confirmar'}`.trim() || 'A confirmar';
    const codigoPostalRaw = `${payload.codigo_postal || ''}`.trim();
    const codigo_postal = codigoPostalRaw || null;

    if (!nome || !telefone || !descricao || !horario_agendado) {
      return json({ ok: false, error: 'validation' }, 400);
    }

    const sql = getDb();
    const [occupied] = await sql`
      SELECT id
      FROM chamados
      WHERE horario_agendado < (${horario_agendado}::timestamp + make_interval(hours => ${SLOT_DURATION_HOURS}))
        AND (horario_agendado + make_interval(hours => ${SLOT_DURATION_HOURS})) > ${horario_agendado}::timestamp
        AND status NOT IN ('concluido', 'cancelado')
      LIMIT 1
    `;
    if (occupied) {
      return json({ ok: false, error: 'slot_unavailable' }, 409);
    }

    const [created] = await sql`
      INSERT INTO chamados (
        nome, telefone, email, morada, bairro, cidade, codigo_postal, descricao, horario_agendado, status
      ) VALUES (
        ${nome}, ${telefone}, ${email}, ${morada}, ${bairro}, ${cidade}, ${codigo_postal}, ${descricao}, ${horario_agendado}, 'pendente'
      )
      RETURNING id, horario_agendado, status, created_at
    `;

    if (email) {
      try {
        await sendAgendamentoEmail({
          toEmail: email,
          toName: nome,
          chamadoId: created.id,
          horarioAgendado: `${created.horario_agendado}`,
          morada,
          bairro,
          cidade,
          codigoPostal: codigo_postal,
          descricao,
        });
      } catch (mailError) {
        console.error('Public agendamento email error:', mailError);
      }
    }

    try {
      const notify = await getBookingNotificationOptions();

      if (notify.emails.length > 0) {
        await Promise.all(
          notify.emails.map((toEmail) =>
            sendNovoAgendamentoInternoEmail({
              toEmail,
              chamadoId: created.id,
              clienteNome: nome,
              clienteTelefone: telefone,
              clienteEmail: email,
              horarioAgendado: `${created.horario_agendado}`,
              morada,
              bairro,
              cidade,
              codigoPostal: codigo_postal,
              descricao,
            })
          )
        );
      }

      if (notify.whatsappCallmebotApiKey && notify.whatsappNumbers.length > 0) {
        await Promise.all(
          notify.whatsappNumbers.map((phone) =>
            sendNovoAgendamentoWhatsAppCallmebot({
              phone,
              apiKey: notify.whatsappCallmebotApiKey,
              chamadoId: created.id,
              clienteNome: nome,
              clienteTelefone: telefone,
              horarioAgendado: `${created.horario_agendado}`,
              morada,
              bairro,
              cidade,
              codigoPostal: codigo_postal,
              descricao,
            })
          )
        );
      }
    } catch (notifyError) {
      console.error('Public agendamento internal notifications error:', notifyError);
    }

    return json({ ok: true }, 201);
  } catch (error) {
    console.error('Public marcacao error:', error);
    return json({ ok: false, error: 'server' }, 500);
  }
};
