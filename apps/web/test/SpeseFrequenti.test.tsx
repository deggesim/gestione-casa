import { test, expect } from 'bun:test';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SpeseFrequenti } from '../src/statistiche/SpeseFrequenti';

const renderPage = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const anno = String(new Date().getFullYear() - 1);
  qc.setQueryData(
    ['statistiche', 'spese-frequenti', 'M'],
    [
      { name: 'spesa', value: 80 },
      { name: 'carburante', value: 20 },
    ],
  );
  qc.setQueryData(['statistiche', 'tutto', 'Y'], [{ name: anno, value: 2400 }]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  render(<SpeseFrequenti />, { wrapper });
  return anno;
};

test('offers the three legacy range options, monthly by default', () => {
  renderPage();
  expect(screen.getByText('Range')).toBeDefined();
  expect((screen.getByLabelText('Ultimo mese') as HTMLInputElement).checked).toBe(true);
  expect(screen.getByLabelText('Ultimo anno')).toBeDefined();
  expect(screen.getByLabelText('Tutto')).toBeDefined();
});

test('shows the common-expenses monthly average table', () => {
  const anno = renderPage();
  const table = screen.getByRole('table', { name: 'Media mensile spese comuni' });
  expect(within(table).getByText(anno)).toBeDefined();
  expect(within(table).getByText(/200,00/)).toBeDefined(); // 2400 / 12
});
