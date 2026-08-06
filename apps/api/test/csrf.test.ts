import { test, expect } from 'bun:test';
import { CSRF_HEADER, CSRF_VALUE } from '@gc/shared-types';
import { assertCsrf } from '../src/auth/csrf';
import { buildApp } from '../src/app';

const reqOf = (method: string, headers: Record<string, string> = {}) =>
  new Request('http://localhost/x', { method, headers });

test('assertCsrf: safe methods pass without the header', () => {
  expect(() => assertCsrf(reqOf('GET'))).not.toThrow();
  expect(() => assertCsrf(reqOf('HEAD'))).not.toThrow();
  expect(() => assertCsrf(reqOf('OPTIONS'))).not.toThrow();
});

test('assertCsrf: mutating method without the header throws', () => {
  expect(() => assertCsrf(reqOf('POST'))).toThrow();
  expect(() => assertCsrf(reqOf('PUT'))).toThrow();
  expect(() => assertCsrf(reqOf('DELETE'))).toThrow();
});

test('assertCsrf: mutating method with the header passes', () => {
  expect(() => assertCsrf(reqOf('POST', { [CSRF_HEADER]: CSRF_VALUE }))).not.toThrow();
});

test('POST without the CSRF header → 403 (end-to-end through buildApp)', async () => {
  const res = await buildApp().handle(
    new Request('http://localhost/utente', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'x@y.it', password: 'pw' }),
    }),
  );
  expect(res.status).toBe(403);
});

test('POST with the CSRF header is not blocked by CSRF', async () => {
  const res = await buildApp().handle(
    new Request('http://localhost/utente', {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CSRF_HEADER]: CSRF_VALUE },
      body: JSON.stringify({ email: 'x@y.it', password: 'pw' }),
    }),
  );
  expect(res.status).not.toBe(403);
});
