import { test, expect } from 'bun:test';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AndamentoList } from '../src/andamento/AndamentoList';

const rows = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  giorno: `2025-01-${String(i + 1).padStart(2, '0')}`,
  descrizione: i === 0 ? 'Pane speciale' : `voce ${i + 1}`,
  costo: (i + 1) * 10,
  tipoSpesa: { id: 1, descrizione: 'spesa' },
}));

const renderList = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(['andamento'], rows);
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

test('filter (>2 chars) narrows the table', async () => {
  renderList();
  expect(screen.getByText('Pane speciale')).toBeDefined();
  fireEvent.change(screen.getByPlaceholderText('Filtro'), { target: { value: 'pane' } });
  await waitFor(() => expect(screen.queryByText('voce 2')).toBeNull());
  expect(screen.getByText('Pane speciale')).toBeDefined();
});
