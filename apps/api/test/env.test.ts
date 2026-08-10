import { test, expect } from 'bun:test';
import { readEnv } from '../src/env';

const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db', JWT_SECRET: 's' };

test('dev keeps the permissive defaults', () => {
  const env = readEnv(base);
  expect(env.CORS_ORIGIN).toBe('*');
  expect(env.COOKIE_SECURE).toBe(false);
  expect(env.COOKIE_DOMAIN).toBeUndefined();
  expect(env.PORT).toBe(5000);
});

test('production refuses to boot without CORS_ORIGIN', () => {
  expect(() => readEnv({ ...base, NODE_ENV: 'production' })).toThrow(/CORS_ORIGIN/);
});

test('production refuses to boot without COOKIE_SECURE', () => {
  expect(() =>
    readEnv({ ...base, NODE_ENV: 'production', CORS_ORIGIN: 'https://app.example.com' }),
  ).toThrow(/COOKIE_SECURE/);
});

test('production accepts an explicit COOKIE_SECURE=false as a choice', () => {
  const env = readEnv({
    ...base,
    NODE_ENV: 'production',
    CORS_ORIGIN: 'https://app.example.com',
    COOKIE_SECURE: 'false',
  });
  expect(env.COOKIE_SECURE).toBe(false);
});

test('production with everything set', () => {
  const env = readEnv({
    ...base,
    NODE_ENV: 'production',
    CORS_ORIGIN: 'https://app.example.com',
    COOKIE_SECURE: 'true',
    COOKIE_DOMAIN: 'example.com',
  });
  expect(env.CORS_ORIGIN).toBe('https://app.example.com');
  expect(env.COOKIE_SECURE).toBe(true);
  expect(env.COOKIE_DOMAIN).toBe('example.com');
});
