import { test, expect } from 'bun:test';
import {
  authCookieOptions,
  ACCESS_MAX_AGE,
  REFRESH_MAX_AGE,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
} from '../src/auth/cookies';

test('authCookieOptions sets httpOnly + Lax + root path', () => {
  const opts = authCookieOptions(ACCESS_MAX_AGE);
  expect(opts.httpOnly).toBe(true);
  expect(opts.sameSite).toBe('lax');
  expect(opts.path).toBe('/');
  expect(opts.maxAge).toBe(900);
  // secure follows env.COOKIE_SECURE; false under the test env (unset)
  expect(opts.secure).toBe(false);
});

test('cookie constants are stable', () => {
  expect([ACCESS_COOKIE, REFRESH_COOKIE]).toEqual(['access', 'refresh']);
  expect(REFRESH_MAX_AGE).toBe(14 * 24 * 60 * 60);
});
