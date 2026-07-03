import { test, expect, beforeEach } from 'bun:test';
import { buildApp } from '../src/app';
import { resetDb } from './setup';

beforeEach(async () => {
  await resetDb();
});

// Return a `cookie:` header string (name=value pairs) from a response's Set-Cookie list.
const cookieHeader = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

const send = (path: string, method: string, body?: unknown, cookie?: string) =>
  buildApp().handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

// Register + login, returning the session cookie header.
const authenticate = async (email = 'a@b.it', password = 'pw') => {
  await send('/utente', 'POST', { email, password });
  const res = await send('/utente/login', 'POST', { email, password });
  expect(res.status).toBe(200);
  return cookieHeader(res);
};

test('login sets httpOnly access + refresh cookies and returns { utente }', async () => {
  await send('/utente', 'POST', { email: 'a@b.it', password: 'pw' });
  const res = await send('/utente/login', 'POST', { email: 'a@b.it', password: 'pw' });
  expect(res.status).toBe(200);
  const setCookies = res.headers.getSetCookie();
  expect(setCookies.some((c) => c.startsWith('access=') && /HttpOnly/i.test(c))).toBe(true);
  expect(setCookies.some((c) => c.startsWith('refresh=') && /HttpOnly/i.test(c))).toBe(true);
  const body = await res.json();
  expect(body.utente.email).toBe('a@b.it');
  expect(body.token).toBeUndefined(); // no bearer token in the body anymore
});

test('login with wrong password → 401', async () => {
  await send('/utente', 'POST', { email: 'a@b.it', password: 'pw' });
  expect((await send('/utente/login', 'POST', { email: 'a@b.it', password: 'nope' })).status).toBe(
    401,
  );
});

test('GET /utente/me requires the access cookie', async () => {
  const cookie = await authenticate();
  expect((await send('/utente/me', 'GET')).status).toBe(401);
  const me = await send('/utente/me', 'GET', undefined, cookie);
  expect(me.status).toBe(200);
  expect((await me.json()).email).toBe('a@b.it');
});

test('POST /utente/refresh rotates the session and returns { utente }', async () => {
  const cookie = await authenticate();
  const res = await send('/utente/refresh', 'POST', undefined, cookie);
  expect(res.status).toBe(200);
  expect((await res.json()).utente.email).toBe('a@b.it');
  // a new access cookie is issued
  expect(res.headers.getSetCookie().some((c) => c.startsWith('access='))).toBe(true);
});

test('refresh without a refresh cookie → 401', async () => {
  expect((await send('/utente/refresh', 'POST')).status).toBe(401);
});

test('logout revokes the refresh token (subsequent refresh → 401)', async () => {
  const cookie = await authenticate();
  expect((await send('/utente/logout', 'POST', undefined, cookie)).status).toBe(200);
  // same refresh cookie can no longer be rotated
  expect((await send('/utente/refresh', 'POST', undefined, cookie)).status).toBe(401);
});

test('PATCH /utente/me updates email + password and forces re-auth', async () => {
  const cookie = await authenticate();
  const res = await send('/utente/me', 'PATCH', { email: 'z@b.it', password: 'new' }, cookie);
  expect(res.status).toBe(200);
  expect((await res.json()).email).toBe('z@b.it');
  // old session revoked
  expect((await send('/utente/refresh', 'POST', undefined, cookie)).status).toBe(401);
  // can log in with the new password
  expect((await send('/utente/login', 'POST', { email: 'z@b.it', password: 'new' })).status).toBe(
    200,
  );
});
