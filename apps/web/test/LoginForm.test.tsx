import { test, expect, mock, afterEach } from 'bun:test';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginForm } from '../src/login/LoginForm';

mock.module('@tanstack/react-router', () => ({ useNavigate: () => () => {} }));

// bun:test doesn't trigger RTL's auto-cleanup; with two tests now rendering
// into the same happy-dom document, an unmounted leftover form from a prior
// test would make later `getByLabelText` queries match more than one element.
afterEach(cleanup);

const renderForm = () => {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <LoginForm />
    </QueryClientProvider>,
  );
};

test('renders email + password fields and a disabled submit while empty', () => {
  renderForm();
  expect(screen.getByLabelText(/email/i)).toBeDefined();
  expect(screen.getByLabelText(/password/i)).toBeDefined();
  const btn = screen.getByRole('button', { name: 'Login' }) as HTMLButtonElement;
  expect(btn.disabled).toBe(true);
});

test('submit enables only after both required fields are filled', async () => {
  renderForm();
  const email = screen.getByLabelText(/email/i);
  const password = screen.getByLabelText(/password/i);
  const btn = () => screen.getByRole('button', { name: 'Login' }) as HTMLButtonElement;

  // Filling only one field keeps it disabled. The inner tick lets RHF's
  // onChange revalidation settle before asserting — a bare `waitFor` would
  // pass on the pre-update `disabled=true` value even if the required
  // validator on the other field were dropped (making the form valid too
  // early), because `waitFor` returns as soon as its first synchronous
  // check succeeds.
  fireEvent.change(email, { target: { value: 'a@b.it' } });
  await waitFor(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(btn().disabled).toBe(true);
  });

  // filling both enables it
  fireEvent.change(password, { target: { value: 'pw' } });
  await waitFor(() => expect(btn().disabled).toBe(false));
});
