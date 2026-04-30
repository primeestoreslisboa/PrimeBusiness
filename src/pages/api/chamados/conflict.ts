import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';

export const GET: APIRoute = async ({ url }) => {
  try {
    const datetime = url.searchParams.get('datetime')?.trim() || '';
    const excludeIdRaw = url.searchParams.get('exclude_id')?.trim() || '';
    const excludeId = Number.parseInt(excludeIdRaw, 10);
    if (!datetime) {
      return new Response(JSON.stringify({ ok: false, error: 'validation' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sql = getDb();
    const [conflict] = await sql`
      SELECT id, horario_agendado
      FROM chamados
      WHERE (${Number.isFinite(excludeId) ? excludeId : -1} < 0 OR id <> ${Number.isFinite(excludeId) ? excludeId : -1})
        AND status NOT IN ('concluido', 'cancelado')
        AND horario_agendado < (${datetime}::timestamp + interval '2 hour')
        AND (horario_agendado + interval '2 hour') > ${datetime}::timestamp
      ORDER BY horario_agendado ASC
      LIMIT 1
    `;

    return new Response(
      JSON.stringify({
        ok: true,
        conflict: !!conflict,
        conflictId: conflict?.id ?? null,
        conflictAt: conflict?.horario_agendado ?? null,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Chamado conflict check error:', error);
    return new Response(JSON.stringify({ ok: false, error: 'server' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

