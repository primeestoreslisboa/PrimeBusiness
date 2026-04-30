import type { APIRoute } from 'astro';
import { initDb } from '../../lib/db';

export const GET: APIRoute = async ({ locals }) => {
  // Only allow admin
  if (locals.user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    await initDb();
    return new Response(JSON.stringify({ ok: true, message: 'Database initialized' }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
