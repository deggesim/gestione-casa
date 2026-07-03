import { test, expect, beforeEach } from 'bun:test';
import { buildApp } from '../src/app';
import { resetDb, seedFixtures } from './setup';

beforeEach(async () => {
  await resetDb();
  await seedFixtures();
});

test('GET /tipo-spesa returns all categories', async () => {
  const res = await buildApp().handle(new Request('http://localhost/tipo-spesa'));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toHaveLength(4);
  expect(body.map((t: { descrizione: string }) => t.descrizione)).toContain('spesa');
});

test('GET /tipo-spesa/:id → 404 when missing', async () => {
  const res = await buildApp().handle(new Request('http://localhost/tipo-spesa/999'));
  expect(res.status).toBe(404);
});
