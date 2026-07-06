import { test, expect, afterEach, afterAll, mock } from 'bun:test';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Layout pulls in the router (Link/Outlet/useNavigate) and the auth hooks.
// Mock the router seam so the shell renders deterministically without a
// RouterProvider — the full router is exercised in manual/e2e verification.
// The auth seam uses the REAL useMe/useLogout hooks with the QueryClient's
// ['me'] cache seeded directly (staleTime: Infinity so no background refetch
// fires): mock.module is process-global in Bun and isn't reliably undone by
// mock.restore(), so mocking an app module like useAuth here would leak into
// useAuth.test.tsx's own real-hook assertions. Seeding the cache sidesteps
// that entirely while still gating Logout visibility on real me.data.
mock.module('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Outlet: () => null,
  useNavigate: () => () => {},
}));

// Imported after the router mock so Layout binds to it.
const { Layout } = await import('../src/layout/Layout');

afterEach(cleanup);
afterAll(() => mock.restore());

const renderLayout = (meData?: { id: number }) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  if (meData) qc.setQueryData(['me'], meData);
  return render(
    <QueryClientProvider client={qc}>
      <Layout />
    </QueryClientProvider>,
  );
};

test('renders the brand + theme toggle and hides Logout when logged out', () => {
  renderLayout();
  expect(screen.getByText('Gestione Casa')).toBeDefined();
  expect(screen.getByLabelText('Cambia tema')).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Logout' })).toBeNull();
});

test('shows the Logout button when logged in', () => {
  renderLayout({ id: 1 });
  expect(screen.getByRole('button', { name: 'Logout' })).toBeDefined();
});
