import { test, expect } from 'bun:test';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AndamentoList } from '../src/andamento/AndamentoList';

const makeRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    giorno: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
    descrizione: i === 0 ? 'Pane speciale' : `voce ${i + 1}`,
    costo: (i + 1) * 10,
    tipoSpesa: { id: 1, descrizione: 'spesa' },
  }));

const rows = makeRows(12);

const renderList = (data: unknown = rows) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(['andamento'], data);
  // The component also calls useTipoSpesaList(); seed it so it resolves from cache
  // (staleTime Infinity) instead of firing a real fetch (ECONNREFUSED noise).
  qc.setQueryData(['tipo-spesa'], []);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  render(<AndamentoList />, { wrapper });
};

test('renders one page (10 rows) and shows pagination when >10 items', () => {
  renderList();
  expect(screen.getByText('Pane speciale')).toBeDefined();
  expect(screen.getAllByRole('row').length).toBeLessThanOrEqual(11); // 1 header + 10 body
  expect(screen.getByLabelText(/paginazione/i)).toBeDefined();
});

test('pagination shows at most 5 numbered page buttons (windowed), not one per page', () => {
  renderList(makeRows(80)); // 80 rows / 10 per page = 8 pages
  const pagination = screen.getByLabelText(/paginazione/i);
  // Numbered page buttons carry digit text; boundary links (First/Prev/Next/Last)
  // render arrow glyphs, so digit-text within the control counts only page numbers.
  const numbered = within(pagination).getAllByText(/^\d+$/);
  expect(numbered.length).toBe(5); // windowed, not 8
});

test('filter (>2 chars) narrows the table', async () => {
  renderList();
  expect(screen.getByText('Pane speciale')).toBeDefined();
  fireEvent.change(screen.getByPlaceholderText('Filtro'), { target: { value: 'pane' } });
  await waitFor(() => expect(screen.queryByText('voce 2')).toBeNull());
  expect(screen.getByText('Pane speciale')).toBeDefined();
});
