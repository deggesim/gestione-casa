import { env } from '../env';

export const ACCESS_COOKIE = 'access';
export const REFRESH_COOKIE = 'refresh';

// JWT sign expiry (parsed by @elysiajs/jwt).
export const ACCESS_TTL = '15m';
export const REFRESH_TTL = '14d';

// Cookie Max-Age in seconds (kept in sync with the TTLs above).
export const ACCESS_MAX_AGE = 15 * 60;
export const REFRESH_MAX_AGE = 14 * 24 * 60 * 60;

export const authCookieOptions = (maxAge: number) =>
  ({
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    domain: env.COOKIE_DOMAIN,
    maxAge,
  }) as const;
