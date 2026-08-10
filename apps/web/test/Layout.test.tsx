import { test, expect, afterEach, mock } from 'bun:test';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routerMock } from './router-mock';

// Layout pulls in the router (Link/Outlet/useNavigate, plus useMatches via
// Breadcrumb) and the auth hooks.
// Mock the router seam so the shell renders deterministically without a
// RouterProvider — the full router is exercised in manual/e2e verification.
// The auth seam uses the REAL useMe/useLogout hooks with the QueryClient's
// ['me'] cache seeded directly (staleTime: Infinity so no background refetch
// fires), which gates Logout visibility on real me.data rather than on a stub.
// (The original reason was also that mock.module leaked across files; `--isolate`
// has since removed that hazard, but seeding the cache is still the better test.)
mock.module('@tanstack/react-router', routerMock);

// The api seam, declared here rather than inherited. In the logged-out cases nothing seeds
// ['me'], so the real useMe genuinely fetches: until `--isolate` that request was answered
// by an api client mock leaked from another test file, and once files stopped sharing a
// module registry these tests started making 12 real HTTP calls that failed with
// ECONNREFUSED — passing only because a failed probe and a pending one look the same here.
// Mocking the client (an external seam) does not conflict with keeping the real auth hooks.
mock.module('../src/api/client', () => ({
  apiClient: {
    utente: {
      me: { get: async () => ({ data: null, error: { status: 401 } }) },
      logout: { post: async () => ({ error: null }) },
    },
  },
}));

// Imported after the router mock so Layout binds to it.
const { Layout } = await import('../src/layout/Layout');

afterEach(cleanup);

const renderLayout = (meData?: { id: number }) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  if (meData) qc.setQueryData(['me'], meData);
  return {
    ...render(
      <QueryClientProvider client={qc}>
        <Layout />
      </QueryClientProvider>,
    ),
    qc,
  };
};

test('renders the brand + theme toggle and hides Logout when logged out', () => {
  renderLayout();
  expect(screen.getByLabelText('Gestione Casa')).toBeDefined();
  expect(screen.getByLabelText('Cambia tema')).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Logout' })).toBeNull();
});

test('shows the Logout button when logged in', () => {
  renderLayout({ id: 1 });
  expect(screen.getByRole('button', { name: 'Logout' })).toBeDefined();
});

test('hides the Statistiche menu when logged out', () => {
  renderLayout();
  expect(screen.queryByRole('button', { name: /statistiche/i })).toBeNull();
});

test('opens the Statistiche menu with the six legacy entries', () => {
  const { container } = renderLayout({ id: 1 });
  const menu = container.querySelector('.dropdown-menu');
  if (!menu) throw new Error('dropdown menu not rendered');
  expect(menu.classList.contains('show')).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: /statistiche/i }));

  expect(menu.classList.contains('show')).toBe(true);
  // Scoped to the menu: "Spesa" would otherwise be ambiguous against the other
  // entries if any of them ever became a substring match.
  for (const voce of [
    'Spese medie',
    'Spese frequenti',
    'Spesa',
    'Carburante',
    'Bollette',
    'Casa',
  ]) {
    expect(within(menu as HTMLElement).getByText(voce)).toBeDefined();
  }
});

test('the mobile toggler shows and hides the navbar content', () => {
  const { container } = renderLayout({ id: 1 });
  const collapse = container.querySelector('.navbar-collapse');
  if (!collapse) throw new Error('navbar collapse not rendered');
  expect(collapse.classList.contains('show')).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Apri il menu' }));
  expect(collapse.classList.contains('show')).toBe(true);

  fireEvent.click(screen.getByRole('button', { name: 'Apri il menu' }));
  expect(collapse.classList.contains('show')).toBe(false);
});

test('clicking a statistiche entry closes the mobile menu', () => {
  const { container } = renderLayout({ id: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Apri il menu' }));
  fireEvent.click(screen.getByRole('button', { name: /statistiche/i }));

  fireEvent.click(screen.getByText('Spese medie'));

  const collapse = container.querySelector('.navbar-collapse');
  expect(collapse?.classList.contains('show')).toBe(false);
});

// Layout is the root route's shell: it mounts once, while the user is still anonymous on
// /login, and never remounts when they log in. react-hook-form reads defaultValues on its
// first render only, so a permanently mounted ProfiloModal would capture an empty email
// and keep it for the whole session. Seeding ['me'] after render is what production does.
test('the profilo modal prefills the email of a user who logged in after mount', async () => {
  const { qc } = renderLayout();
  qc.setQueryData(['me'], { id: 1, email: 'utente@example.it' });

  const profilo = await waitFor(() => screen.getByRole('button', { name: /profilo utente/i }));
  fireEvent.click(profilo);

  // Asserted against the seeded address. This used to be a weaker `not.toBe('')` because
  // useAuth.test.tsx's process-global api mock could answer the ['me'] fetch that useMe
  // starts at mount and win the race with its own user. With `--isolate` plus this file's
  // own client mock (which answers 401), the seeded value is the only user in play.
  const email = (await waitFor(() => screen.getByLabelText('Email'))) as HTMLInputElement;
  expect(email.value).toBe('utente@example.it');
});
