import { test, expect, mock } from 'bun:test';
import { handleUnauthorized, errorBody, isSilencedAuthProbe } from '../src/query/query-client';

const deps = (refresh: () => Promise<{ error: { status: number } | null }>) => ({
  refresh,
  invalidateAll: mock(async () => {}),
  navigate: mock(() => {}),
  onExpired: mock(() => {}),
});

test('handleUnauthorized: refresh ok → refetch everything, no redirect, no toast', async () => {
  const d = deps(mock(async () => ({ error: null })));
  await handleUnauthorized(d);
  expect(d.refresh).toHaveBeenCalledTimes(1);
  expect(d.invalidateAll).toHaveBeenCalledTimes(1);
  expect(d.navigate).not.toHaveBeenCalled();
  expect(d.onExpired).not.toHaveBeenCalled();
});

test('handleUnauthorized: refresh fails → toast + redirect /login, no refetch', async () => {
  const d = deps(mock(async () => ({ error: { status: 401 } })));
  await handleUnauthorized(d);
  expect(d.onExpired).toHaveBeenCalledTimes(1);
  expect(d.navigate).toHaveBeenCalledWith('/login');
  expect(d.invalidateAll).not.toHaveBeenCalled();
});

// The reason this module dedupes at all: the refresh token is single-use, so a burst of 401s
// must not rotate it once per failed query.
test('handleUnauthorized: a burst shares one refresh, one toast, one redirect', async () => {
  const d = deps(mock(async () => ({ error: { status: 401 } })));
  await Promise.all([handleUnauthorized(d), handleUnauthorized(d), handleUnauthorized(d)]);
  expect(d.refresh).toHaveBeenCalledTimes(1);
  expect(d.onExpired).toHaveBeenCalledTimes(1);
  expect(d.navigate).toHaveBeenCalledTimes(1);
});

// A leaked in-flight slot would make every later 401 unrecoverable for the whole session.
test('handleUnauthorized: the slot is released once a burst settles', async () => {
  const first = deps(mock(async () => ({ error: null })));
  await handleUnauthorized(first);
  const second = deps(mock(async () => ({ error: null })));
  await handleUnauthorized(second);
  expect(second.refresh).toHaveBeenCalledTimes(1);
});

test('errorBody: string value → itself', () => {
  expect(errorBody({ status: 422, value: 'costo troppo basso' })).toBe('costo troppo basso');
});

test('errorBody: object value → message then error field', () => {
  expect(errorBody({ value: { message: 'msg' } })).toBe('msg');
  expect(errorBody({ value: { error: 'err' } })).toBe('err');
});

test('errorBody: no usable body → undefined', () => {
  expect(errorBody({ status: 500 })).toBeUndefined();
  expect(errorBody(null)).toBeUndefined();
});

test('isSilencedAuthProbe: 401 on an auth-probe query → true', () => {
  expect(isSilencedAuthProbe({ status: 401 }, { meta: { authProbe: true } })).toBe(true);
});

test('isSilencedAuthProbe: 401 without authProbe meta → false', () => {
  expect(isSilencedAuthProbe({ status: 401 }, { meta: {} })).toBe(false);
  expect(isSilencedAuthProbe({ status: 401 })).toBe(false);
});

test('isSilencedAuthProbe: non-401 on an auth-probe query → false', () => {
  expect(isSilencedAuthProbe({ status: 500 }, { meta: { authProbe: true } })).toBe(false);
});
