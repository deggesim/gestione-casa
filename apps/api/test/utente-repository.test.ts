import { test, expect, beforeEach } from 'bun:test';
import { db } from '../src/db/client';
import { createUtenteRepository } from '../src/utente/utente.repository';
import { resetDb } from './setup';

const repo = createUtenteRepository(db);
beforeEach(async () => {
  await resetDb();
});

test('findToken/removeToken are scoped by utenteId AND value', async () => {
  const a = await repo.create('a@b.it', 'h');
  const b = await repo.create('c@d.it', 'h');
  await repo.addToken(a.id, 'ra');
  await repo.addToken(b.id, 'rb');

  expect(await repo.findToken(a.id, 'ra')).not.toBeNull();
  // same value under the wrong user must not match
  expect(await repo.findToken(b.id, 'ra')).toBeNull();

  // removing a's token with b's id is a no-op
  await repo.removeToken(b.id, 'ra');
  expect(await repo.findToken(a.id, 'ra')).not.toBeNull();

  await repo.removeToken(a.id, 'ra');
  expect(await repo.findToken(a.id, 'ra')).toBeNull();
});

test('update changes email and/or password hash', async () => {
  const u = await repo.create('a@b.it', 'oldhash');
  await repo.update(u.id, { email: 'new@b.it', passwordHash: 'newhash' });
  const found = await repo.findById(u.id);
  expect(found!.email).toBe('new@b.it');
  expect(found!.password).toBe('newhash');
});
