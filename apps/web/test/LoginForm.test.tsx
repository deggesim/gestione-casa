import { test, expect, mock } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginForm } from '../src/login/LoginForm';

mock.module('@tanstack/react-router', () => ({ useNavigate: () => () => {} }));

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
