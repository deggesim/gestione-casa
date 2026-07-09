import { test, expect } from 'bun:test';
import {
  formatCosto,
  formatGiorno,
  filterAndamenti,
  sortAndamenti,
} from '../src/andamento/list-utils';

const mk = (
  over: Partial<{
    id: number;
    giorno: string;
    descrizione: string;
    costo: number;
    tipoSpesa: { id: number; descrizione: string };
  }>,
) => ({
  id: 1,
  giorno: '2025-01-10',
  descrizione: 'spesa gen',
  costo: 100,
  tipoSpesa: { id: 1, descrizione: 'spesa' },
  ...over,
});

test('formatGiorno renders dd/MM/yyyy without timezone drift', () => {
  expect(formatGiorno('2025-01-09')).toBe('09/01/2025');
});

test('formatCosto renders an it-IT EUR amount', () => {
  // Non-breaking spaces vary by ICU; assert the stable parts.
  const s = formatCosto(1234.5);
  expect(s).toContain('€');
  expect(s).toContain('1.234,50');
});

test('filterAndamenti: <=2 chars returns the full list', () => {
  const list = [mk({}), mk({ id: 2, descrizione: 'altro' })];
  expect(filterAndamenti(list, 'sp')).toHaveLength(2);
});

test('filterAndamenti: >2 chars matches descrizione OR tipoSpesa.descrizione, case-insensitive', () => {
  const list = [
    mk({ id: 1, descrizione: 'Pane', tipoSpesa: { id: 1, descrizione: 'spesa' } }),
    mk({ id: 2, descrizione: 'Diesel', tipoSpesa: { id: 2, descrizione: 'carburante' } }),
  ];
  expect(filterAndamenti(list, 'pan').map((a) => a.id)).toEqual([1]);
  expect(filterAndamenti(list, 'CARB').map((a) => a.id)).toEqual([2]);
});

test('sortAndamenti: costo ascending/descending is numeric', () => {
  const list = [mk({ id: 1, costo: 100 }), mk({ id: 2, costo: 50 })];
  expect(sortAndamenti(list, 'costo', 'asc').map((a) => a.costo)).toEqual([50, 100]);
  expect(sortAndamenti(list, 'costo', 'desc').map((a) => a.costo)).toEqual([100, 50]);
});

test('sortAndamenti: giorno/descrizione is lexicographic and does not mutate input', () => {
  const list = [mk({ id: 1, giorno: '2025-02-01' }), mk({ id: 2, giorno: '2025-01-01' })];
  expect(sortAndamenti(list, 'giorno', 'asc').map((a) => a.id)).toEqual([2, 1]);
  expect(list.map((a) => a.id)).toEqual([1, 2]); // original untouched
});
