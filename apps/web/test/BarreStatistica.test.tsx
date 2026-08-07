import { test, expect } from 'bun:test';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BarreStatistica } from '../src/statistiche/BarreStatistica';

// Recharts draws nothing under happy-dom (ResponsiveContainer measures 0x0), so
// these tests cover the controls around the chart, never the SVG.
const renderBarre = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(['statistiche', 'spesa', 'M'], [{ name: '202607', value: 10 }]);
  qc.setQueryData(['statistiche', 'spesa', 'Y'], [{ name: '2026', value: 120 }]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<BarreStatistica kind="spesa" />, { wrapper });
};

test('starts monthly, with the legacy "Frequenza" radios', () => {
  renderBarre();
  expect(screen.getByText('Frequenza')).toBeDefined();
  expect((screen.getByLabelText('Mensile') as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText('Annuale') as HTMLInputElement).checked).toBe(false);
});

test('switching to Annuale swaps the chart container class', async () => {
  const { container } = renderBarre();
  expect(container.querySelector('.barre-orizzontali-mensile')).not.toBeNull();
  fireEvent.click(screen.getByLabelText('Annuale'));
  await waitFor(() => expect(container.querySelector('.barre-orizzontali-annuale')).not.toBeNull());
  expect(container.querySelector('.barre-orizzontali-mensile')).toBeNull();
});
