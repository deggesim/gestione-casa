import { test, expect, mock } from 'bun:test';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const pageOf = (items: unknown[], page = 1) => ({
  data: { items, total: 25, page, pageSize: 10 },
  error: null,
});
const get = mock(async (_opts?: unknown) => pageOf([{ id: 1 }]));
const post = mock(async () => ({ data: { id: 9 }, error: null }));
const put = mock(async () => ({ data: { id: 5 }, error: null }));
const del = mock(async () => ({ data: { deleted: 1 }, error: null }));
const byId = mock((_args: { id: number }) => ({ put, delete: del }));
// No annotation: mock.module's factory is typed `() => any` (bun-types), so this
// object's shape is never checked against the real client's type.
const andamento = Object.assign(byId, { get, post });

// Every statistiche endpoint has the same shape — ({ interval }) => { get } — so one
// spy stands in for all six and also records which interval was requested.
const statsGet = mock(async () => ({ data: [{ name: '2026', value: 12 }], error: null }));
const statistiche = mock((_args: { interval: string }) => ({ get: statsGet }));

mock.module('../src/api/client', () => ({
  apiClient: {
    andamento,
    'tipo-spesa': { get: async () => ({ data: [{ id: 1, descrizione: 'spesa' }], error: null }) },
    statistiche: {
      spesa: statistiche,
      carburante: statistiche,
      bolletta: statistiche,
      casa: statistiche,
      'spese-frequenti': statistiche,
      tutto: statistiche,
    },
  },
}));

const wrapper =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

const freshQc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const params = { page: 2, pageSize: 10, q: '', sort: 'costo', dir: 'asc' } as const;

test('useAndamentoList sends the page params as the query, omitting an empty q', async () => {
  get.mockClear();
  const { useAndamentoList } = await import('../src/andamento/queries');
  const { result } = renderHook(() => useAndamentoList(params), { wrapper: wrapper(freshQc()) });
  // Cast: `data`'s static type is the real `AndamentoPage` (from queries.ts's import),
  // unaffected by the mocked runtime shape — the fixture only needs the `id` field.
  await waitFor(() => expect(result.current.data as unknown).toMatchObject({ items: [{ id: 1 }] }));
  expect(get).toHaveBeenCalledWith({
    query: { page: 2, pageSize: 10, sort: 'costo', dir: 'asc' },
  });
});

test('useAndamentoList sends q once it is set', async () => {
  get.mockClear();
  const { useAndamentoList } = await import('../src/andamento/queries');
  renderHook(() => useAndamentoList({ ...params, q: 'pane' }), { wrapper: wrapper(freshQc()) });
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  expect(get).toHaveBeenCalledWith({
    query: { page: 2, pageSize: 10, q: 'pane', sort: 'costo', dir: 'asc' },
  });
});

test('useAndamentoList keeps the previous page on screen while the next one loads', async () => {
  const { useAndamentoList } = await import('../src/andamento/queries');
  let release = () => {};
  get.mockImplementation(async (opts) =>
    (opts as { query: { page: number } }).query.page === 1
      ? pageOf([{ id: 1 }], 1)
      : new Promise((r) => (release = () => r(pageOf([{ id: 11 }], 2)))),
  );
  const { result, rerender } = renderHook(({ p }) => useAndamentoList({ ...params, page: p }), {
    wrapper: wrapper(freshQc()),
    initialProps: { p: 1 },
  });
  await waitFor(() => expect(result.current.data?.items.length).toBe(1));

  rerender({ p: 2 });
  await waitFor(() => expect(result.current.isPlaceholderData).toBe(true));
  expect(result.current.data?.page).toBe(1); // still the old page, not undefined

  release();
  await waitFor(() => expect(result.current.data?.page).toBe(2));
  get.mockImplementation(async () => pageOf([{ id: 1 }]));
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

test('useStatistica calls the endpoint for its kind with the interval', async () => {
  statistiche.mockClear();
  const { useStatistica } = await import('../src/statistiche/queries');
  const { result } = renderHook(() => useStatistica('carburante', 'Y'), {
    wrapper: wrapper(freshQc()),
  });
  await waitFor(() =>
    expect(result.current.data as unknown).toEqual([{ name: '2026', value: 12 }]),
  );
  expect(statistiche).toHaveBeenCalledWith({ interval: 'Y' });
});

test('useSpeseFrequenti passes the interval through', async () => {
  statistiche.mockClear();
  const { useSpeseFrequenti } = await import('../src/statistiche/queries');
  const { result } = renderHook(() => useSpeseFrequenti('A'), { wrapper: wrapper(freshQc()) });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(statistiche).toHaveBeenCalledWith({ interval: 'A' });
});

test('useTutto is always yearly', async () => {
  statistiche.mockClear();
  const { useTutto } = await import('../src/statistiche/queries');
  const { result } = renderHook(() => useTutto(), { wrapper: wrapper(freshQc()) });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(statistiche).toHaveBeenCalledWith({ interval: 'Y' });
});
