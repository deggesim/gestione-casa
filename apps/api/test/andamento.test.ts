import { test, expect, beforeEach } from 'bun:test';
import { sql } from 'drizzle-orm';
import { CSRF_HEADER, CSRF_VALUE } from '@gc/shared-types';
import { buildApp } from '../src/app';
import { db } from '../src/db/client';
import { resetDb, seedFixtures } from './setup';

let cookie = '';
beforeEach(async () => {
  await resetDb();
  await seedFixtures();
  cookie = await login();
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

const req = (path: string, init: RequestInit = {}) =>
  buildApp().handle(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), cookie, [CSRF_HEADER]: CSRF_VALUE },
    }),
  );

test('GET /andamento without a session → 401', async () => {
  const res = await buildApp().handle(new Request('http://localhost/andamento'));
  expect(res.status).toBe(401);
});

test('GET /andamento returns entries sorted by giorno DESC, costo is a number', async () => {
  const res = await req('/andamento');
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toHaveLength(4);
  expect(body[0].giorno >= body[1].giorno).toBe(true);
  expect(body[0].giorno).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(typeof body[0].costo).toBe('number');
  expect(body[0].tipoSpesa.descrizione).toBeDefined();
});

test('GET /andamento returns legacy rows with costo below 0.01 (response not over-validated)', async () => {
  // Real migrated data has costo = 0.00 rows (e.g. a corrected entry). The create/update
  // INPUT schema forbids < 0.01, but the response/domain schema must faithfully return
  // stored data — insert directly (bypassing input validation) to simulate legacy data.
  await db.execute(
    sql`INSERT INTO gc.andamento (giorno, descrizione, costo, tipo_spesa_id) VALUES ('2020-01-01', 'voce legacy a costo zero', 0.00, 1)`,
  );
  const res = await req('/andamento');
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.some((a: { costo: number }) => a.costo === 0)).toBe(true);
});

test('POST /andamento creates an entry', async () => {
  const res = await req('/andamento', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      giorno: '2025-03-01',
      descrizione: 'nuovo',
      costo: 12.5,
      tipoSpesa: { id: 1 },
    }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.id).toBeGreaterThan(0);
  expect(body.costo).toBe(12.5);
});

test('POST /andamento with missing tipoSpesa → 400', async () => {
  const res = await req('/andamento', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      giorno: '2025-03-01',
      descrizione: 'x',
      costo: 5,
      tipoSpesa: { id: 999 },
    }),
  });
  expect(res.status).toBe(400);
});

test('POST /andamento with costo below minimum → 400', async () => {
  const res = await req('/andamento', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      giorno: '2025-03-01',
      descrizione: 'x',
      costo: 0,
      tipoSpesa: { id: 1 },
    }),
  });
  expect(res.status).toBe(400);
});

test('PUT /andamento/:id updates; unknown id → 400', async () => {
  const list = await (await req('/andamento')).json();
  const id = list[0].id;
  const ok = await req(`/andamento/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id,
      giorno: '2025-01-10',
      descrizione: 'mod',
      costo: 5,
      tipoSpesa: { id: 1 },
    }),
  });
  expect(ok.status).toBe(200);
  const bad = await req('/andamento/999999', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 999999,
      giorno: '2025-01-10',
      descrizione: 'x',
      costo: 5,
      tipoSpesa: { id: 1 },
    }),
  });
  expect(bad.status).toBe(400);
});

test('DELETE /andamento/:id removes; unknown id → 404', async () => {
  const list = await (await req('/andamento')).json();
  expect((await req(`/andamento/${list[0].id}`, { method: 'DELETE' })).status).toBe(200);
  expect((await req('/andamento/999999', { method: 'DELETE' })).status).toBe(404);
});

test('PUT /andamento/:id with a nonexistent tipoSpesa → 400', async () => {
  const list = await (await req('/andamento')).json();
  const id = list[0].id;
  const res = await req(`/andamento/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id,
      giorno: '2025-01-10',
      descrizione: 'mod',
      costo: 5,
      tipoSpesa: { id: 999 },
    }),
  });
  expect(res.status).toBe(400);
});

test('GET /andamento/:id found and missing', async () => {
  const list = await (await req('/andamento')).json();
  const found = await req(`/andamento/${list[0].id}`);
  expect(found.status).toBe(200);
  const foundBody = await found.json();
  expect(foundBody.descrizione).toBe(list[0].descrizione);

  const missing = await req('/andamento/999999');
  expect(missing.status).toBe(404);
});
