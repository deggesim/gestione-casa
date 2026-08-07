import { test, expect, afterEach } from 'bun:test';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfiloModal } from '../src/utente/ProfiloModal';

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
