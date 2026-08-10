import { test, expect, afterEach, afterAll, mock } from 'bun:test';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routerMock } from './router-mock';

// Layout pulls in the router (Link/Outlet/useNavigate, plus useMatches via
// Breadcrumb) and the auth hooks.
// Mock the router seam so the shell renders deterministically without a
// RouterProvider — the full router is exercised in manual/e2e verification.
// The auth seam uses the REAL useMe/useLogout hooks with the QueryClient's
// ['me'] cache seeded directly (staleTime: Infinity so no background refetch
// fires): mock.module is process-global in Bun and isn't reliably undone by
// mock.restore(), so mocking an app module like useAuth here would leak into
// useAuth.test.tsx's own real-hook assertions. Seeding the cache sidesteps
// that entirely while still gating Logout visibility on real me.data.
mock.module('@tanstack/react-router', routerMock);

// Imported after the router mock so Layout binds to it.
const { Layout } = await import('../src/layout/Layout');

afterEach(cleanup);
afterAll(() => mock.restore());

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

  // Asserted as "not empty" rather than against the seeded address: the ['me'] fetch that
  // useMe starts at mount is still in flight when the seed lands, and useAuth.test.tsx
  // mocks the api client process-globally, so in a full-suite run that fetch can resolve
  // with its own user and win the race. Either address is a legitimate current user; the
  // regression this guards against produces an empty field, whatever the cache holds.
  const email = (await waitFor(() => screen.getByLabelText('Email'))) as HTMLInputElement;
  expect(email.value).not.toBe('');
});
