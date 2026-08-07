import { test, expect } from 'bun:test';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SpeseMedie } from '../src/statistiche/SpeseMedie';

// Seeded cache instead of a module mock: with staleTime Infinity the four queries
// resolve straight from the cache and nothing hits the network.
const renderPage = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const anno = String(new Date().getFullYear() - 1); // a full past year -> divisor 12
  for (const kind of ['bolletta', 'spesa', 'carburante', 'casa']) {
    qc.setQueryData(['statistiche', kind, 'Y'], [{ name: anno, value: 1200 }]);
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  render(<SpeseMedie />, { wrapper });
  return anno;
};

test('renders the four average tables with their legacy titles', () => {
  renderPage();
  for (const titolo of [
    'Media bolletta mensile',
    'Media spesa mensile',
    'Media carburante mensile',
    'Media casa mensile',
  ]) {
    expect(screen.getByRole('table', { name: titolo })).toBeDefined();
  }
});

test('divides a full past year by 12', () => {
  const anno = renderPage();
  const table = screen.getByRole('table', { name: 'Media spesa mensile' });
  expect(within(table).getByText(anno)).toBeDefined();
  expect(within(table).getByText(/100,00/)).toBeDefined(); // 1200 / 12
});
