import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { verifyPassword, createToken } from '../../../lib/auth';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(new Error(`${label}_timeout`));
      }, timeoutMs);
    }),
  ]);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const isHttps = new URL(request.url).protocol === 'https:';
    const contentType = request.headers.get('content-type') || '';
    let email = '';
    let password = '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const raw = await withTimeout(request.text(), 5000, 'login_body_text');
      const params = new URLSearchParams(raw);
      email = (params.get('email') || '').trim();
      password = params.get('password') || '';
    } else {
      const formData = await withTimeout(request.formData(), 5000, 'login_formdata');
      email = formData.get('email')?.toString().trim() || '';
      password = formData.get('password')?.toString() || '';
    }

    if (!email || !password) {
      return new Response(null, { status: 303, headers: { Location: '/login?error=invalid' } });
    }

    const sql = getDb();
    const [user] = await withTimeout(
      sql`
        SELECT *
        FROM users
        WHERE deleted_at IS NULL
          AND (
            lower(email) = lower(${email})
            OR lower(name) = lower(${email})
          )
        LIMIT 1
      `,
      10000,
      'login_db_lookup'
    );

    if (!user) {
      return new Response(null, { status: 303, headers: { Location: '/login?error=invalid' } });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return new Response(null, { status: 303, headers: { Location: '/login?error=invalid' } });
    }

    const token = await createToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return new Response(null, {
      status: 303,
      headers: {
        Location: '/dashboard',
        'Set-Cookie': `auth_token=${token}; HttpOnly; ${isHttps ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=604800`,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return new Response(null, { status: 303, headers: { Location: '/login?error=server' } });
  }
};
