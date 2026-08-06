import { test, expect, beforeEach } from 'bun:test';
import { CSRF_HEADER, CSRF_VALUE } from '@gc/shared-types';
import { buildApp } from '../src/app';
import { resetDb, seedFixtures } from './setup';

beforeEach(async () => {
  await resetDb();
  await seedFixtures();
});

const cookieHeader = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

const login = async () => {
  await buildApp().handle(
    new Request('http://localhost/utente', {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CSRF_HEADER]: CSRF_VALUE },
      body: JSON.stringify({ email: 'a@b.it', password: 'pw' }),
    }),
  );
  const res = await buildApp().handle(
    new Request('http://localhost/utente/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CSRF_HEADER]: CSRF_VALUE },
      body: JSON.stringify({ email: 'a@b.it', password: 'pw' }),
    }),
  );
  return cookieHeader(res);
};

const get = (path: string, cookie?: string) =>
  buildApp().handle(new Request(`http://localhost${path}`, { headers: cookie ? { cookie } : {} }));

test('GET /tipo-spesa without a session → 401', async () => {
  expect((await get('/tipo-spesa')).status).toBe(401);
});

test('GET /tipo-spesa returns all categories when authenticated', async () => {
  const cookie = await login();
  const res = await get('/tipo-spesa', cookie);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toHaveLength(4);
  expect(body.map((t: { descrizione: string }) => t.descrizione)).toContain('spesa');
});

test('GET /tipo-spesa/:id → 404 when missing', async () => {
  const cookie = await login();
  expect((await get('/tipo-spesa/999', cookie)).status).toBe(404);
});
