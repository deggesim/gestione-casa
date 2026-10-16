import { test, expect } from 'bun:test';
import { Value } from '@sinclair/typebox/value';
import { MessageSchema } from './common';
import { AndamentoQuerySchema } from './andamento';
import { LoginResponseSchema } from './utente';

test('MessageSchema accepts { message } and rejects missing message', () => {
  expect(Value.Check(MessageSchema, { message: 'ok' })).toBe(true);
  expect(Value.Check(MessageSchema, {})).toBe(false);
});

test('LoginResponseSchema accepts { utente: { email } }', () => {
  expect(Value.Check(LoginResponseSchema, { utente: { id: 1, email: 'a@b.it' } })).toBe(true);
  expect(Value.Check(LoginResponseSchema, { utente: { email: 'a@b.it' } })).toBe(true); // id optional
  expect(Value.Check(LoginResponseSchema, { utente: {} })).toBe(false); // email required
});

test('AndamentoQuerySchema: every field optional; page/pageSize bounded integers, sort/dir enums', () => {
  expect(Value.Check(AndamentoQuerySchema, {})).toBe(true);
  expect(
    Value.Check(AndamentoQuerySchema, {
      page: 2,
      pageSize: 100,
      q: 'x',
      sort: 'costo',
      dir: 'asc',
    }),
  ).toBe(true);
  for (const bad of [{ page: 0 }, { page: 1.5 }, { pageSize: 101 }, { sort: 'id' }, { dir: 'up' }])
    expect(Value.Check(AndamentoQuerySchema, bad)).toBe(false);
});
