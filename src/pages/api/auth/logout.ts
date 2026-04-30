import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  const isHttps = new URL(request.url).protocol === 'https:';
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/login',
      'Set-Cookie': `auth_token=; HttpOnly; ${isHttps ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=0`,
    },
  });
};
