import { test, expect, mock, beforeEach, afterAll } from 'bun:test';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMe, useLogout } from '../src/auth/useAuth';

// mock the Eden client module
mock.module('../src/api/client', () => ({
  apiClient: {
    utente: {
      me: { get: async () => ({ data: { id: 1, email: 'a@b.it' }, error: null }) },
      logout: { post: async () => ({ error: null }) },
    },
  },
}));

// mock.module is process-global in Bun — restore it so this mock can't leak
// into other test files that import '../src/api/client'.
afterAll(() => mock.restore());

const wrapper =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

beforeEach(() => {});

test('useMe resolves the current user from GET /utente/me', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useMe(), { wrapper: wrapper(qc) });
  await waitFor(() => expect(result.current.data).toEqual({ id: 1, email: 'a@b.it' }));
});

// Guards the double-toast regression: logout must clear ['me'] without refetching it
// (a refetch would 401 since the cookie is gone, firing an error toast alongside the
// logout success toast).
test('useLogout clears the ["me"] cache without refetching it', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['me'], { id: 1, email: 'a@b.it' });
  const { result } = renderHook(() => useLogout(), { wrapper: wrapper(qc) });

  result.current.mutate();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(qc.getQueryData(['me'])).toBeNull();
  expect(qc.getQueryState(['me'])?.fetchStatus).toBe('idle');
});
