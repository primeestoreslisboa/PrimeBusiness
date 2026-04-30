import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

const JWT_SECRET = new TextEncoder().encode(
  import.meta.env.JWT_SECRET || process.env.JWT_SECRET || 'fallback-secret-change-in-production-32ch'
);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(payload: { userId: number; email: string; role: string; name: string }): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<{ userId: number; email: string; role: string; name: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as { userId: number; email: string; role: string; name: string };
  } catch {
    return null;
  }
}

export function getTokenFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map(c => c.trim());
  const tokenCookie = cookies.find(c => c.startsWith('auth_token='));
  return tokenCookie ? tokenCookie.split('=')[1] : null;
}
