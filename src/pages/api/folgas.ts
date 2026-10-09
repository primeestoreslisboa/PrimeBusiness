import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db';

export const prerender = false;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const POST: APIRoute = async ({ request, redirect, locals }) => {
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const form = await request.formData();
    const action = form.get('action')?.toString() || 'bloquear';
    const data = form.get('data')?.toString().trim() || '';
    const motivo = form.get('motivo')?.toString().trim() || null;

    if (!DATE_RE.test(data)) {
      return redirect(`/dashboard?error=folga_data`);
    }

    const sql = getDb();
    if (action === 'remover') {
      await sql`DELETE FROM folgas WHERE data = ${data}`;
      return redirect(`/dashboard?date=${data}&success=folga_removida`);
    }

    await sql`
      INSERT INTO folgas (data, motivo)
      VALUES (${data}, ${motivo})
      ON CONFLICT (data) DO UPDATE SET motivo = EXCLUDED.motivo
    `;
    return redirect(`/dashboard?date=${data}&success=folga_marcada`);
  } catch (error) {
    console.error('Folga error:', error);
    return redirect(`/dashboard?error=server`);
  }
};
