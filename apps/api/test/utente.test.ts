import { test, expect, beforeEach } from 'bun:test';
import { buildApp } from '../src/app';
import { resetDb } from './setup';

beforeEach(async () => {
  await resetDb();
});

const json = (path: string, method: string, body?: unknown, token?: string) =>
  buildApp().handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );

test('register then login returns { utente, token }', async () => {
  const reg = await json('/utente', 'POST', { email: 'a@b.it', password: 'pw' });
  expect(reg.status).toBe(201);
  const res = await json('/utente/login', 'POST', { email: 'a@b.it', password: 'pw' });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.token).toBeString();
  expect(body.utente.email).toBe('a@b.it');
});

test('login with wrong password → 401', async () => {
  await json('/utente', 'POST', { email: 'a@b.it', password: 'pw' });
  expect((await json('/utente/login', 'POST', { email: 'a@b.it', password: 'nope' })).status).toBe(
    401,
  );
});

test('GET /utente/me requires a valid Bearer token', async () => {
  await json('/utente', 'POST', { email: 'a@b.it', password: 'pw' });
  const token = (
    await (await json('/utente/login', 'POST', { email: 'a@b.it', password: 'pw' })).json()
  ).token;
  expect((await json('/utente/me', 'GET')).status).toBe(401);
  const me = await json('/utente/me', 'GET', undefined, token);
  expect(me.status).toBe(200);
  expect((await me.json()).email).toBe('a@b.it');
});
