import { test, expect, beforeEach } from 'bun:test';
import { buildApp } from '../src/app';
import { resetDb, seedFixtures } from './setup';

beforeEach(async () => {
  await resetDb();
  await seedFixtures();
});

const req = (path: string, init?: RequestInit) =>
  buildApp().handle(new Request(`http://localhost${path}`, init));

test('GET /andamento returns entries sorted by giorno DESC, costo is a number', async () => {
  const res = await req('/andamento');
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toHaveLength(4);
  expect(body[0].giorno >= body[1].giorno).toBe(true);
  expect(typeof body[0].costo).toBe('number');
  expect(body[0].tipoSpesa.descrizione).toBeDefined();
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
