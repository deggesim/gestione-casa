import { test, expect, mock, afterAll } from 'bun:test';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const rows = [
  {
    id: 1,
    giorno: '2025-01-10',
    descrizione: 'spesa gen',
    costo: 100,
    tipoSpesa: { id: 1, descrizione: 'spesa' },
  },
];
const post = mock(async () => ({ data: rows[0], error: null }));
const del = mock(async () => ({ data: { deleted: 1 }, error: null }));
const byId = mock((_a: { id: number }) => ({
  put: async () => ({ data: rows[0], error: null }),
  delete: del,
}));
const andamento = Object.assign(byId, { get: async () => ({ data: rows, error: null }), post });

mock.module('../src/api/client', () => ({
  apiClient: {
    andamento,
    'tipo-spesa': {
      get: async () => ({
        data: [
          { id: 1, descrizione: 'spesa' },
          { id: 2, descrizione: 'carburante' },
          { id: 7, descrizione: 'casa' },
        ],
        error: null,
      }),
    },
    // Superset so a mock.module leak into another test file (e.g. useAuth.test.tsx)
    // can't break it — mirrors what that file's own mock provides.
    utente: {
      me: { get: async () => ({ data: { id: 1, email: 'a@b.it' }, error: null }) },
      login: { post: async () => ({ data: { utente: { id: 1, email: 'a@b.it' } }, error: null }) },
      logout: { post: async () => ({ error: null }) },
      refresh: { post: async () => ({ error: null }) },
    },
  },
}));
mock.module('sonner', () => ({
  toast: { success: () => {}, warning: () => {}, error: () => {} },
  // Toaster completes the mock: mock.module is process-global on CI's bun and
  // mock.restore doesn't undo it, so this leaks into Layout.test.tsx, which imports
  // { Toaster } from sonner — a partial mock there fails "Export 'Toaster' not found".
  Toaster: () => null,
}));
afterAll(() => mock.restore());

const renderList = async () => {
  const { AndamentoList } = await import('../src/andamento/AndamentoList');
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  render(<AndamentoList />, { wrapper });
  await waitFor(() => expect(screen.getByText('spesa gen')).toBeDefined());
};

test('"Nuova" opens the modal titled "Nuova voce di spesa"', async () => {
  await renderList();
  fireEvent.click(screen.getByRole('button', { name: /nuova voce di spesa/i }));
  await waitFor(() => expect(screen.getByText('Nuova voce di spesa')).toBeDefined());
});

test('quick-add "Spesa" prefills descrizione "Spesa"', async () => {
  await renderList();
  fireEvent.click(screen.getByRole('button', { name: 'Spesa' }));
  await waitFor(() =>
    expect(
      (within(screen.getByRole('dialog')).getByLabelText(/descrizione/i) as HTMLInputElement).value,
    ).toBe('Spesa'),
  );
});

test('row delete → confirm → calls DELETE by id', async () => {
  del.mockClear();
  byId.mockClear();
  await renderList();
  fireEvent.click(screen.getByRole('button', { name: /elimina/i }));
  await waitFor(() => expect(screen.getByText('Elimina voce di spesa')).toBeDefined());
  // confirm button inside the dialog
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Elimina' }));
  await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
  expect(byId).toHaveBeenCalledWith({ id: 1 });
});
