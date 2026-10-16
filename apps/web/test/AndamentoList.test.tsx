import { test, expect, mock } from 'bun:test';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { DEFAULT_SEARCH, type ListSearch } from '../src/andamento/list-utils';

// Never resolves: any query that is NOT seeded stays pending, which is exactly the state
// keepPreviousData has to cover (and keeps the suite off the network).
mock.module('../src/api/client', () => ({
  apiClient: {
    andamento: { get: () => new Promise(() => {}) },
    'tipo-spesa': { get: () => new Promise(() => {}) },
  },
}));

const makeRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    giorno: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
    descrizione: i === 0 ? 'Pane speciale' : `voce ${i + 1}`,
    costo: (i + 1) * 10,
    tipoSpesa: { id: 1, descrizione: 'spesa' },
  }));

// What GET /andamento returns: one server page plus the full total.
const pageOf = (total: number, page = 1) => ({
  items: makeRows(Math.min(10, total)),
  total,
  page,
  pageSize: 10,
});

const keyOf = (s: ListSearch) => ['andamento', { ...s, pageSize: 10 }];

const renderList = async (data: unknown, search: ListSearch = DEFAULT_SEARCH) => {
  const { AndamentoList } = await import('../src/andamento/AndamentoList');
  const onSearchChange = mock((_patch: Partial<ListSearch>, _opts?: { replace?: boolean }) => {});
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(keyOf(search), data);
  qc.setQueryData(['tipo-spesa'], []);
  const ui = (s: ListSearch) => <AndamentoList search={s} onSearchChange={onSearchChange} />;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const utils = render(ui(search), { wrapper });
  return { qc, onSearchChange, rerender: (s: ListSearch) => utils.rerender(ui(s)) };
};

const filtro = () => screen.getByPlaceholderText('Filtro') as HTMLInputElement;

test('renders exactly the rows the server sent (no client-side slicing) and shows pagination', async () => {
  await renderList(pageOf(12));
  expect(screen.getByText('Pane speciale')).toBeDefined();
  expect(screen.getAllByRole('row').length).toBe(11); // 1 header + 10 body
  expect(screen.getByLabelText(/paginazione/i)).toBeDefined();
});

test('hides pagination when the total fits one page', async () => {
  await renderList(pageOf(10));
  expect(screen.queryByLabelText(/paginazione/i)).toBeNull();
});

test('pagination shows at most 5 numbered page buttons (windowed), not one per page', async () => {
  await renderList(pageOf(80)); // 80 rows / 10 per page = 8 pages
  const numbered = within(screen.getByLabelText(/paginazione/i)).getAllByText(/^\d+$/);
  expect(numbered.length).toBe(5); // windowed, not 8
});

test('picking a page asks the URL for that page (Next / Last included)', async () => {
  const { onSearchChange } = await renderList(pageOf(80));
  const pagination = within(screen.getByLabelText(/paginazione/i));
  fireEvent.click(pagination.getByText('3'));
  expect(onSearchChange).toHaveBeenLastCalledWith({ page: 3 });
  fireEvent.click(pagination.getByText('›')); // Next
  expect(onSearchChange).toHaveBeenLastCalledWith({ page: 2 });
  fireEvent.click(pagination.getByText('»')); // Last
  expect(onSearchChange).toHaveBeenLastCalledWith({ page: 8 });
});

test('sorting asks for the key + direction and goes back to page 1', async () => {
  const { onSearchChange } = await renderList(pageOf(12, 2), { ...DEFAULT_SEARCH, page: 2 });
  fireEvent.click(screen.getByLabelText('Ordina per costo crescente'));
  expect(onSearchChange).toHaveBeenLastCalledWith({ sort: 'costo', dir: 'asc', page: 1 });
});

test('typing in the filter is debounced, resets the page and replaces the history entry', async () => {
  const { onSearchChange } = await renderList(pageOf(12), { ...DEFAULT_SEARCH, page: 1 });
  fireEvent.change(filtro(), { target: { value: 'pane' } });
  expect(onSearchChange).not.toHaveBeenCalled(); // not on every keystroke
  await waitFor(() =>
    expect(onSearchChange).toHaveBeenCalledWith({ q: 'pane', page: 1 }, { replace: true }),
  );
  expect(onSearchChange).toHaveBeenCalledTimes(1);
});

test('the clear button applies immediately, without waiting for the debounce', async () => {
  const { onSearchChange } = await renderList(pageOf(12), { ...DEFAULT_SEARCH, q: 'pane' });
  expect(filtro().value).toBe('pane'); // initial value comes from the URL
  fireEvent.click(screen.getByLabelText('Pulisci filtro'));
  expect(onSearchChange).toHaveBeenLastCalledWith({ q: '', page: 1 });
  expect(filtro().value).toBe('');
});

test('the filter input follows q when the URL changes under it (Back button)', async () => {
  const withPane = { ...DEFAULT_SEARCH, q: 'pane' };
  const withCola = { ...DEFAULT_SEARCH, q: 'cola' };
  const { qc, rerender } = await renderList(pageOf(12), withPane);
  qc.setQueryData(keyOf(withCola), pageOf(12));
  rerender(withCola);
  await waitFor(() => expect(filtro().value).toBe('cola'));
});

test('a URL that catches up with an earlier debounce does not overwrite newer typing', async () => {
  const base = { ...DEFAULT_SEARCH };
  const withPane = { ...DEFAULT_SEARCH, q: 'pane' };
  const { qc, onSearchChange, rerender } = await renderList(pageOf(12), base);
  qc.setQueryData(keyOf(withPane), pageOf(12));

  fireEvent.change(filtro(), { target: { value: 'pane' } });
  await waitFor(() => expect(onSearchChange).toHaveBeenCalledTimes(1)); // 'pane' pushed
  fireEvent.change(filtro(), { target: { value: 'panel' } }); // user keeps typing…
  rerender(withPane); // …and only now the URL reflects 'pane'
  await waitFor(() => expect(onSearchChange).toHaveBeenCalledTimes(2)); // 'panel' pushed
  expect(filtro().value).toBe('panel');
});

test('a page the server clamped (e.g. last row deleted on the last page) is written back to the URL', async () => {
  const { onSearchChange } = await renderList(pageOf(15, 2), { ...DEFAULT_SEARCH, page: 5 });
  await waitFor(() => expect(onSearchChange).toHaveBeenCalledWith({ page: 2 }, { replace: true }));
});

test('placeholder data from the previous page is not mistaken for a clamp', async () => {
  const { rerender, onSearchChange } = await renderList(pageOf(30, 1));
  rerender({ ...DEFAULT_SEARCH, page: 2 }); // page 2 is not cached → pending, page 1 shown
  await new Promise((r) => setTimeout(r, 50)); // let any (wrong) re-sync effect run
  expect(screen.getByText('Pane speciale')).toBeDefined(); // old page still on screen
  expect(onSearchChange).not.toHaveBeenCalled(); // and no bogus "go back to page 1"
});
