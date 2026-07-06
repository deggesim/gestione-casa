import { test, expect, mock } from 'bun:test';
import { handleUnauthorized } from '../src/query/query-client';

test('handleUnauthorized: refresh ok → invalidate me, no redirect', async () => {
  const refresh = mock(async () => ({ error: null }));
  const invalidate = mock(async () => {});
  const navigate = mock(() => {});
  await handleUnauthorized({ refresh, invalidateMe: invalidate, navigate });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(navigate).not.toHaveBeenCalled();
});

test('handleUnauthorized: refresh fails → redirect /login', async () => {
  const refresh = mock(async () => ({ error: { status: 401 } }));
  const invalidate = mock(async () => {});
  const navigate = mock(() => {});
  await handleUnauthorized({ refresh, invalidateMe: invalidate, navigate });
  expect(navigate).toHaveBeenCalledWith('/login');
  expect(invalidate).not.toHaveBeenCalled();
});
