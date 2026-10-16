export type SortKey = 'giorno' | 'descrizione' | 'costo';
export type SortDir = 'asc' | 'desc';

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
export const formatCosto = (n: number): string => eur.format(n);

// "YYYY-MM-DD" -> "dd/MM/yyyy" by string split (no Date -> no UTC shift).
export const formatGiorno = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// Up to `size` consecutive page numbers, windowed around `current` (legacy maxSize=5).
export const pageWindow = (current: number, pageCount: number, size = 5): number[] => {
  const count = Math.min(size, pageCount);
  const start = Math.max(1, Math.min(current - Math.floor(size / 2), pageCount - count + 1));
  return Array.from({ length: count }, (_, i) => start + i);
};

// What the list keeps in the URL (`/home?page=2&q=pane&sort=costo&dir=asc`), so a link
// reproduces the exact view and Back steps through pages.
export type ListSearch = { page: number; q: string; sort: SortKey; dir: SortDir };
export const DEFAULT_SEARCH: ListSearch = { page: 1, q: '', sort: 'giorno', dir: 'desc' };

const SORT_KEYS: readonly SortKey[] = ['giorno', 'descrizione', 'costo'];

// `validateSearch` for /home. Lenient on purpose: a hand-edited or stale link falls back
// to the defaults field by field rather than throwing into the error page.
export const parseListSearch = (raw: Record<string, unknown>): Partial<ListSearch> => {
  const out: Partial<ListSearch> = {};
  const { page, q, sort, dir } = raw;
  if ((typeof page === 'number' || typeof page === 'string') && Number.isInteger(Number(page))) {
    if (Number(page) >= 1) out.page = Number(page);
  }
  // The router JSON-parses values, so `?q=2025` arrives as the number 2025.
  if ((typeof q === 'string' || typeof q === 'number') && String(q) !== '') out.q = String(q);
  if (SORT_KEYS.includes(sort as SortKey)) out.sort = sort as SortKey;
  if (dir === 'asc' || dir === 'desc') out.dir = dir;
  return out;
};

// Drop every field equal to its default so the canonical URL stays short.
export const compactSearch = (s: ListSearch): Partial<ListSearch> =>
  Object.fromEntries(
    Object.entries(s).filter(([k, v]) => v !== DEFAULT_SEARCH[k as keyof ListSearch]),
  );
