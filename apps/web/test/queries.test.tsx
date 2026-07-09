import { test, expect, mock, afterAll } from 'bun:test';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const get = mock(async () => ({ data: [{ id: 1 }], error: null }));
const post = mock(async () => ({ data: { id: 9 }, error: null }));
const put = mock(async () => ({ data: { id: 5 }, error: null }));
const del = mock(async () => ({ data: { deleted: 1 }, error: null }));
const byId = mock((_args: { id: number }) => ({ put, delete: del }));
// No annotation: mock.module's factory is typed `() => any` (bun-types), so this
// object's shape is never checked against the real client's type.
const andamento = Object.assign(byId, { get, post });

mock.module('../src/api/client', () => ({
  apiClient: {
    andamento,
    'tipo-spesa': { get: async () => ({ data: [{ id: 1, descrizione: 'spesa' }], error: null }) },
  },
}));

afterAll(() => mock.restore());

const wrapper =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

const freshQc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

test('useAndamentoList fetches GET /andamento', async () => {
  const { useAndamentoList } = await import('../src/andamento/queries');
  const { result } = renderHook(() => useAndamentoList(), { wrapper: wrapper(freshQc()) });
  // Cast: `data`'s static type is the real `Andamento[]` (from queries.ts's import),
  // unaffected by the mocked runtime shape — the fixture only needs the `id` field.
  await waitFor(() => expect(result.current.data as unknown).toEqual([{ id: 1 }]));
});

test('useSaveAndamento POSTs when id is absent, PUTs when present', async () => {
  post.mockClear();
  put.mockClear();
  byId.mockClear();
  const { useSaveAndamento } = await import('../src/andamento/queries');
  const { result } = renderHook(() => useSaveAndamento(), { wrapper: wrapper(freshQc()) });

  result.current.mutate({ giorno: '2025-01-01', descrizione: 'x', costo: 5, tipoSpesa: { id: 1 } });
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));

  result.current.mutate({
    id: 5,
    giorno: '2025-01-01',
    descrizione: 'x',
    costo: 5,
    tipoSpesa: { id: 1 },
  });
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  expect(byId).toHaveBeenCalledWith({ id: 5 });
});

test('useDeleteAndamento DELETEs by id', async () => {
  del.mockClear();
  byId.mockClear();
  const { useDeleteAndamento } = await import('../src/andamento/queries');
  const { result } = renderHook(() => useDeleteAndamento(), { wrapper: wrapper(freshQc()) });
  result.current.mutate(7);
  await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
  expect(byId).toHaveBeenCalledWith({ id: 7 });
});
