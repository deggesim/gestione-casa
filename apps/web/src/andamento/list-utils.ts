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

export const sortAndamenti = (list: Andamento[], key: SortKey, dir: SortDir): Andamento[] => {
  const sign = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (key === 'costo') return (a.costo - b.costo) * sign;
    const x = a[key];
    const y = b[key];
    return (x < y ? -1 : x > y ? 1 : 0) * sign;
  });
};
