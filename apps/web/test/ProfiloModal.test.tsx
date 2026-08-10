import { test, expect, afterEach, mock } from 'bun:test';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routerMock } from './router-mock';
import { ProfiloModal } from '../src/utente/ProfiloModal';

const navigate = mock(() => {});

// Explicit, not inherited. Until `--isolate`, this file had no router mock of its own and
// silently ran on the one leaked from Layout.test/LoginForm.test — which is why its save
// path, the only place the component navigates, had never been exercised. With per-file
// module registries a local mock cannot reach another file, so no superset is needed:
// declare exactly what this component uses.
mock.module('@tanstack/react-router', () => ({ ...routerMock(), useNavigate: () => navigate }));

mock.module('../src/api/client', () => ({
  apiClient: {
    utente: {
      me: { patch: async () => ({ data: { id: 1, email: 'nuovo@example.it' }, error: null }) },
    },
  },
}));

afterEach(cleanup);

const renderModal = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } },
  });
  qc.setQueryData(['me'], { id: 1, email: 'utente@example.it' });
  return render(
    <QueryClientProvider client={qc}>
      <ProfiloModal show onHide={() => {}} />
    </QueryClientProvider>,
  );
};

const typeIn = (label: string, value: string) => {
  const field = screen.getByLabelText(label);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
};

test('prefills the email of the current user', () => {
  renderModal();
  expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('utente@example.it');
});

test('rejects mismatched passwords with a field error and keeps Salva disabled', async () => {
  renderModal();
  typeIn('Nuova password', 'segreto1');
  typeIn('Conferma password', 'segreto2');

  await waitFor(() => expect(screen.getByText('Le password non coincidono')).toBeDefined());
  expect((screen.getByRole('button', { name: 'Salva' }) as HTMLButtonElement).disabled).toBe(true);
});

test('clears the mismatch error when the first password is corrected', async () => {
  renderModal();
  typeIn('Nuova password', 'segreto1');
  typeIn('Conferma password', 'segreto2');
  await waitFor(() => expect(screen.getByText('Le password non coincidono')).toBeDefined());

  // Regression guard: react-hook-form only revalidates the field that changed, so without
  // deps: ['confirmPassword'] on newPassword this error would stay on screen forever.
  typeIn('Nuova password', 'segreto2');

  // Wait on the button becoming enabled, not on the message disappearing: under happy-dom
  // a `waitFor` whose condition is an *absence* costs a flat 5s even though its callback
  // passes immediately (RTL's async wrapper ends on a setTimeout(0) that never fires until
  // something else wakes the loop). Every other waitFor in this suite waits on a presence
  // for the same reason. The absence is then asserted synchronously, which is what the
  // deps regression actually needs: isValid is recomputed over the whole form, so it flips
  // to true even with a stale error still rendered.
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Salva' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  expect(screen.queryByText('Le password non coincidono')).toBeNull();
});

test('redirects to /login after a successful save', async () => {
  navigate.mockClear();
  renderModal();
  typeIn('Nuova password', 'nuova-password');
  typeIn('Conferma password', 'nuova-password');

  // Wait for Salva to enable before clicking. RHF's isValid only flips after an async
  // validation pass, so clicking straight after typing clicks a still-disabled button and
  // silently does nothing — the mutation never runs and the test fails on the redirect with
  // no hint as to why.
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Salva' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

  // Saving revokes every session server-side, so the redirect is not cosmetic: without it
  // the app would keep rendering authenticated screens against a dead session. The e2e
  // profilo flow covers the same property end to end.
  await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/login' }));
});
