import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { hashPassword } from '../../../lib/auth';

export const GET: APIRoute = async () => {
  const sql = getDb();
  const users = await sql`SELECT id, name, email, role, created_at FROM users WHERE deleted_at IS NULL ORDER BY name`;
  return new Response(JSON.stringify(users), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, redirect, locals }) => {
  if (locals.user?.role !== 'admin') return new Response('Forbidden', { status: 403 });
  try {
    const fd = await request.formData();
    const name     = fd.get('name')?.toString().trim();
    const email    = fd.get('email')?.toString().trim();
    const password = fd.get('password')?.toString();
    const role     = fd.get('role')?.toString() || 'tecnico';
    if (!name || !email || !password) return redirect('/admin/utilizadores/novo?error=missing');
    const sql = getDb();
    const hash = await hashPassword(password);
    await sql`INSERT INTO users (name, email, password_hash, role) VALUES (${name}, ${email}, ${hash}, ${role})`;
    return redirect('/admin/utilizadores?success=1');
  } catch (e: any) {
    const isUnique = e.message?.includes('unique') || e.message?.includes('duplicate');
    return redirect(`/admin/utilizadores/novo?error=${isUnique ? 'exists' : 'server'}`);
  }
};
