import { test, expect, mock, beforeEach } from 'bun:test';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMe } from '../src/auth/useAuth';

// mock the Eden client module
mock.module('../src/api/client', () => ({
  apiClient: {
    utente: { me: { get: async () => ({ data: { id: 1, email: 'a@b.it' }, error: null }) } },
  },
}));

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
