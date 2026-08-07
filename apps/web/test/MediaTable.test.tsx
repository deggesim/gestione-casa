import { test, expect } from 'bun:test';
import { render, screen, within } from '@testing-library/react';
import { MediaTable } from '../src/statistiche/MediaTable';

test('renders the title, the Anno/Spesa headers and one formatted row per entry', () => {
  render(
    <MediaTable
      titolo="Media spesa mensile"
      rows={[
        { name: '2026', value: 100 },
        { name: '2025', value: 250.5 },
      ]}
    />,
  );
  const table = screen.getByRole('table', { name: 'Media spesa mensile' });
  expect(within(table).getByText('Anno')).toBeDefined();
  expect(within(table).getByText('Spesa')).toBeDefined();
  expect(within(table).getAllByRole('row').length).toBe(3); // header + 2
  expect(within(table).getByText('2026')).toBeDefined();
  // it-IT currency renders as "100,00 €" with a narrow no-break space.
  expect(within(table).getByText(/100,00/)).toBeDefined();
  expect(within(table).getByText(/250,50/)).toBeDefined();
});

test('renders the optional subtitle', () => {
  render(<MediaTable titolo="T" sottotitolo="(spesa, carburante)" rows={[]} />);
  expect(screen.getByText('(spesa, carburante)')).toBeDefined();
});
