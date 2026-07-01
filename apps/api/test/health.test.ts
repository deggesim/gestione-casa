import { test, expect } from 'bun:test';
import { buildApp } from '../src/app';

test('GET /health returns ok', async () => {
  const app = buildApp();
  const res = await app.handle(new Request('http://localhost/health'));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok' });
});
