import { defineMiddleware } from 'astro:middleware';
import { getTokenFromCookie, verifyToken } from './lib/auth';
import { getDb } from './lib/db';

const PUBLIC_ROUTES = ['/login', '/api/auth/login', '/orcamento/aceitar', '/api/orcamento/aceitar', '/api/mbway/callback', '/orcamento/ver', '/orcamento/pdf'];

function isPublicPath(pathname: string) {
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) return true;
  if (pathname === '/api/public' || pathname.startsWith('/api/public/')) return true;
  // Vite dev client/runtime assets
  if (pathname.startsWith('/@vite/')) return true;
  if (pathname.startsWith('/@id/')) return true;
  if (pathname.startsWith('/@fs/')) return true;
  if (pathname.startsWith('/@react-refresh')) return true;
  if (pathname.startsWith('/src/')) return true;
  if (pathname.startsWith('/node_modules/')) return true;
  if (pathname.startsWith('/_astro/')) return true;
  if (/\.(mjs|js|css|map|json|svg|ico|png|jpg|jpeg|webp|woff|woff2|ttf|eot)$/i.test(pathname)) return true;
  if (pathname === '/favicon.svg' || pathname === '/favicon.ico') return true;
  return false;
}

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

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const normalizedPath = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  const isHttps = context.url.protocol === 'https:';

  // Hard bypass for public booking endpoint (GET/POST/OPTIONS)
  if (normalizedPath === '/api/public/agendamento') {
    return next();
  }

  // Allow public routes
  if (isPublicPath(normalizedPath)) {
    return next();
  }

  // Check auth token
  const cookieHeader = context.request.headers.get('cookie');
  const token = getTokenFromCookie(cookieHeader);

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    return context.redirect('/login');
  }

  const user = await verifyToken(token);
  if (!user) {
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    return context.redirect('/login');
  }

  const sql = getDb();
  let activeUser: any = null;
  try {
    const rows = await withTimeout(
      sql`
        SELECT id, email, role, name
        FROM users
        WHERE id = ${user.userId} AND deleted_at IS NULL
        LIMIT 1
      `,
      10000,
      'middleware_user_lookup'
    );
    activeUser = rows?.[0] ?? null;
  } catch (err) {
    console.error('Middleware user lookup error:', err);
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Sessao indisponivel' }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `auth_token=; HttpOnly; ${isHttps ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=0`,
        },
      });
    }
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/login?error=server',
        'Set-Cookie': `auth_token=; HttpOnly; ${isHttps ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=0`,
      },
    });
  }

  if (!activeUser) {
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Utilizador inativo' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `auth_token=; HttpOnly; ${isHttps ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=0`,
        },
      });
    }
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/login',
        'Set-Cookie': `auth_token=; HttpOnly; ${isHttps ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=0`,
      },
    });
  }

  context.locals.user = {
    userId: activeUser.id,
    email: activeUser.email,
    role: activeUser.role,
    name: activeUser.name,
  };
  return next();
});
