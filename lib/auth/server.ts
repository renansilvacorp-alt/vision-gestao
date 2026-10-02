import { createNeonAuth } from '@neondatabase/auth/next/server';

const baseUrl = process.env.NEON_AUTH_BASE_URL;
const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;

if (!baseUrl) {
  throw new Error('NEON_AUTH_BASE_URL não configurado.');
}
if (!cookieSecret || cookieSecret.length < 32) {
  throw new Error('NEON_AUTH_COOKIE_SECRET precisa ter pelo menos 32 caracteres.');
}

export const auth = createNeonAuth({
  baseUrl,
  cookies: {
    secret: cookieSecret,
    sameSite: 'lax',
  },
  logLevel: 'warn',
});
