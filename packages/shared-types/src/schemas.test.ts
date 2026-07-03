import { test, expect } from 'bun:test';
import { Value } from '@sinclair/typebox/value';
import { MessageSchema } from './common';
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
