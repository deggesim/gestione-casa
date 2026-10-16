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

const list = async (qs = '') => {
  const res = await req(`/andamento${qs}`);
  return { res, body: await res.json() };
};
const descrizioni = (body: { items: { descrizione: string }[] }) =>
  body.items.map((a) => a.descrizione);

test('GET /andamento returns a page envelope sorted by giorno DESC, costo is a number', async () => {
  const { res, body } = await list();
  expect(res.status).toBe(200);
  expect(body).toMatchObject({ total: 4, page: 1, pageSize: 10 });
  expect(body.items).toHaveLength(4);
  expect(body.items[0].giorno >= body.items[1].giorno).toBe(true);
  expect(body.items[0].giorno).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(typeof body.items[0].costo).toBe('number');
  expect(body.items[0].tipoSpesa.descrizione).toBeDefined();
});

test('GET /andamento returns legacy rows with costo below 0.01 (response not over-validated)', async () => {
  // Real migrated data has costo = 0.00 rows (e.g. a corrected entry). The create/update
  // INPUT schema forbids < 0.01, but the response/domain schema must faithfully return
  // stored data — insert directly (bypassing input validation) to simulate legacy data.
  await db.execute(
    sql`INSERT INTO gc.andamento (giorno, descrizione, costo, tipo_spesa_id) VALUES ('2020-01-01', 'voce legacy a costo zero', 0.00, 1)`,
  );
  const { res, body } = await list();
  expect(res.status).toBe(200);
  expect(body.items.some((a: { costo: number }) => a.costo === 0)).toBe(true);
});

test('GET /andamento?page&pageSize slices the sorted set and reports the full total', async () => {
  const { body } = await list('?pageSize=2&page=2');
  expect(body).toMatchObject({ total: 4, page: 2, pageSize: 2 });
  expect(descrizioni(body)).toEqual(['carburante gen', 'spesa gen']);
});

test('GET /andamento clamps a page past the end to the last page', async () => {
  const { body } = await list('?pageSize=3&page=99');
  expect(body.page).toBe(2);
  expect(descrizioni(body)).toEqual(['spesa gen']);
});

test('GET /andamento sorts by the requested key and direction', async () => {
  const asc = await list('?sort=costo&dir=asc');
  expect(asc.body.items.map((a: { costo: number }) => a.costo)).toEqual([40, 50, 80, 100]);
  const desc = await list('?sort=descrizione&dir=desc');
  expect(descrizioni(desc.body)).toEqual([
    'spesa gen',
    'spesa feb',
    'carburante gen',
    'bolletta feb',
  ]);
});

test('GET /andamento breaks ties by id DESC so pages never overlap or skip rows', async () => {
  await db.execute(sql`
    INSERT INTO gc.andamento (giorno, descrizione, costo, tipo_spesa_id) VALUES
      ('2025-03-01','gemella a',1,1),('2025-03-01','gemella b',1,1)`);
  const first = await list('?pageSize=1&page=1');
  const second = await list('?pageSize=1&page=2');
  expect(descrizioni(first.body)).toEqual(['gemella b']); // higher id first
  expect(descrizioni(second.body)).toEqual(['gemella a']);
});

test('GET /andamento?q filters on descrizione OR tipoSpesa, only past 2 chars', async () => {
  await db.execute(
    sql`INSERT INTO gc.andamento (giorno, descrizione, costo, tipo_spesa_id) VALUES ('2025-03-01','gasolio',30,2)`,
  );
  const byCategory = await list('?q=CARB'); // case-insensitive; 'gasolio' matches via its category
  expect(byCategory.body.total).toBe(2);
  expect(descrizioni(byCategory.body)).toContain('gasolio');
  expect((await list('?q=ca')).body.total).toBe(5); // 2 chars → ignored
});

test('GET /andamento?q treats % and _ literally, not as LIKE wildcards', async () => {
  await db.execute(
    sql`INSERT INTO gc.andamento (giorno, descrizione, costo, tipo_spesa_id) VALUES ('2025-03-01','sconto 50% oggi',9,1)`,
  );
  expect((await list('?q=%25%25%25')).body.total).toBe(0); // "%%%" would match everything unescaped
  expect(descrizioni((await list('?q=50%25')).body)).toEqual(['sconto 50% oggi']);
});

test('GET /andamento with a filter matching nothing → empty items, total 0, page 1', async () => {
  const { body } = await list('?q=zzzz');
  expect(body).toMatchObject({ items: [], total: 0, page: 1 });
});

test.each(['page=0', 'page=1.5', 'pageSize=0', 'pageSize=101', 'sort=id', 'dir=up'])(
  'GET /andamento?%s → 400',
  async (qs) => {
    expect((await req(`/andamento?${qs}`)).status).toBe(400);
  },
);

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
  const { items } = await (await req('/andamento')).json();
  const id = items[0].id;
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
  const { items } = await (await req('/andamento')).json();
  expect((await req(`/andamento/${items[0].id}`, { method: 'DELETE' })).status).toBe(200);
  expect((await req('/andamento/999999', { method: 'DELETE' })).status).toBe(404);
});

test('PUT /andamento/:id with a nonexistent tipoSpesa → 400', async () => {
  const { items } = await (await req('/andamento')).json();
  const id = items[0].id;
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
  const { items } = await (await req('/andamento')).json();
  const found = await req(`/andamento/${items[0].id}`);
  expect(found.status).toBe(200);
  const foundBody = await found.json();
  expect(foundBody.descrizione).toBe(items[0].descrizione);

  const missing = await req('/andamento/999999');
  expect(missing.status).toBe(404);
});
