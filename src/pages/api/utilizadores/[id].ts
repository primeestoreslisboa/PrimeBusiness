import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { hashPassword } from '../../../lib/auth';

export const POST: APIRoute = async ({ params, request, redirect, locals }) => {
  if (locals.user?.role !== 'admin') return new Response('Forbidden', { status: 403 });
  const fd     = await request.formData();
  const method = fd.get('_method')?.toString();
  const { id } = params;
  const sql    = getDb();

  if (method === 'DELETE') {
    if (String(locals.user?.userId || '') === String(id)) {
      return redirect('/admin/utilizadores?error=self_delete');
    }
    try {
      await sql`UPDATE users SET deleted_at = NOW() WHERE id = ${id} AND deleted_at IS NULL`;
      return redirect('/admin/utilizadores?success=1');
    } catch {
      return redirect('/admin/utilizadores?error=delete_failed');
    }
  }

  if (method === 'PUT') {
    try {
      const name     = fd.get('name')?.toString().trim();
      const email    = fd.get('email')?.toString().trim();
      const password = fd.get('password')?.toString();
      const role     = fd.get('role')?.toString() || 'tecnico';
      if (password) {
        const hash = await hashPassword(password);
        await sql`UPDATE users SET name=${name}, email=${email}, role=${role}, password_hash=${hash} WHERE id=${id} AND deleted_at IS NULL`;
      } else {
        await sql`UPDATE users SET name=${name}, email=${email}, role=${role} WHERE id=${id} AND deleted_at IS NULL`;
      }
      return redirect(`/admin/utilizadores/${id}?success=1`);
    } catch {
      return redirect(`/admin/utilizadores/${id}?error=server`);
    }
  }

  return new Response('Method not allowed', { status: 405 });
};
