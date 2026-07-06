import { test, expect, afterEach, afterAll, mock } from 'bun:test';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Layout pulls in the router (Link/Outlet/useNavigate) and the auth hooks. Mock
// both seams so the shell renders deterministically without a RouterProvider or
// a live API — the full router + real /utente/me flow is exercised in manual/e2e
// verification. Mirrors the react-router mock already used in LoginForm.test.tsx.
let meData: { id: number } | undefined;
mock.module('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Outlet: () => null,
  useNavigate: () => () => {},
}));
mock.module('../src/auth/useAuth', () => ({
  useMe: () => ({ data: meData }),
  useLogin: () => ({ mutate: () => {} }),
  useLogout: () => ({ mutate: () => {} }),
}));

// Imported after the mocks so Layout binds to them.
const { Layout } = await import('../src/layout/Layout');

afterEach(cleanup);
// mock.module is process-global in Bun — restore it so these mocks can't leak
// into other test files that import the same module specifiers.
afterAll(() => mock.restore());

const renderLayout = () => {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <Layout />
    </QueryClientProvider>,
  );
};

test('renders the brand + theme toggle and hides Logout when logged out', () => {
  meData = undefined;
  renderLayout();
  expect(screen.getByText('Gestione Casa')).toBeDefined();
  expect(screen.getByLabelText('Cambia tema')).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Logout' })).toBeNull();
});

test('shows the Logout button when logged in', () => {
  meData = { id: 1 };
  renderLayout();
  expect(screen.getByRole('button', { name: 'Logout' })).toBeDefined();
});
