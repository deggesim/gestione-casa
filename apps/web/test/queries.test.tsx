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
    // Superset so a mock.module leak into another test file (e.g. useAuth.test.tsx)
    // can't break it — process-global on CI's bun; mock.restore doesn't undo it.
    utente: {
      me: { get: async () => ({ data: { id: 1, email: 'a@b.it' }, error: null }) },
      login: { post: async () => ({ data: { utente: { id: 1, email: 'a@b.it' } }, error: null }) },
      logout: { post: async () => ({ error: null }) },
      refresh: { post: async () => ({ error: null }) },
    },
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
