import type { Andamento } from '@gc/shared-types';

export type SortKey = 'giorno' | 'descrizione' | 'costo';
export type SortDir = 'asc' | 'desc';

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
export const formatCosto = (n: number): string => eur.format(n);

// "YYYY-MM-DD" -> "dd/MM/yyyy" by string split (no Date -> no UTC shift).
export const formatGiorno = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// Parity: filter only kicks in past 2 chars; matches descrizione OR category name.
export const filterAndamenti = (list: Andamento[], filtro: string): Andamento[] => {
  if (filtro.length <= 2) return list;
  const q = filtro.toLowerCase();
  return list.filter(
    (a) =>
      a.descrizione.toLowerCase().includes(q) || a.tipoSpesa.descrizione.toLowerCase().includes(q),
  );
};

// Up to `size` consecutive page numbers, windowed around `current` (legacy maxSize=5).
export const pageWindow = (current: number, pageCount: number, size = 5): number[] => {
  const count = Math.min(size, pageCount);
  const start = Math.max(1, Math.min(current - Math.floor(size / 2), pageCount - count + 1));
  return Array.from({ length: count }, (_, i) => start + i);
};

export const sortAndamenti = (list: Andamento[], key: SortKey, dir: SortDir): Andamento[] => {
  const sign = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (key === 'costo') return (a.costo - b.costo) * sign;
    const x = a[key];
    const y = b[key];
    return (x < y ? -1 : x > y ? 1 : 0) * sign;
  });
};
