import { test, expect, beforeEach } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { CSRF_HEADER, CSRF_VALUE } from '@gc/shared-types';
import { buildApp } from '../src/app';
import { resetDb, seedFixtures } from './setup';

beforeEach(async () => {
  await resetDb();
  await seedFixtures();
});

// Cookie header string from a treaty response's Set-Cookie list.
const cookieOf = (res: { headers: Headers }) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

test('Eden treaty resolves the typed API contract end-to-end', async () => {
  const api = treaty(buildApp());

  // register + login (public, mutating → CSRF header required)
  await api.utente.post(
    { email: 'a@b.it', password: 'pw' },
    { headers: { [CSRF_HEADER]: CSRF_VALUE } },
  );
  const login = await api.utente.login.post(
    { email: 'a@b.it', password: 'pw' },
    { headers: { [CSRF_HEADER]: CSRF_VALUE } },
  );
  expect(login.status).toBe(200);
  expect(login.data?.utente.email).toBe('a@b.it');
  const cookie = cookieOf(login.response);

  // guarded: GET /andamento — costo is a number over the typed client
  const list = await api.andamento.get({ headers: { cookie } });
  expect(list.status).toBe(200);
  expect(Array.isArray(list.data)).toBe(true);
  if (list.data && list.data.length) expect(typeof list.data[0]!.costo).toBe('number');

  // guarded: GET /statistiche/spesa/:interval — value is a number
  const spesa = await api.statistiche.spesa({ interval: 'M' }).get({ headers: { cookie } });
  expect(spesa.status).toBe(200);
  if (spesa.data && spesa.data.length) expect(typeof spesa.data[0]!.value).toBe('number');

  // guarded: GET /utente/me
  const me = await api.utente.me.get({ headers: { cookie } });
  expect(me.status).toBe(200);
  expect(me.data?.email).toBe('a@b.it');

  // unauthenticated call is rejected
  const denied = await api.utente.me.get();
  expect(denied.status).toBe(401);
});
