import type { Statistica } from '@gc/shared-types';

// ngx-charts colour sets, copied verbatim so the ported charts keep the legacy palette.
export const SOLAR = [
  '#fff8e1',
  '#ffecb3',
  '#ffe082',
  '#ffd54f',
  '#ffca28',
  '#ffc107',
  '#ffb300',
  '#ffa000',
  '#ff8f00',
  '#ff6f00',
] as const;

export const NATURAL = [
  '#bf9d76',
  '#e99450',
  '#d89f59',
  '#f2dfa7',
  '#a5d7c6',
  '#7794b1',
  '#afafaf',
  '#707160',
  '#ba9383',
  '#d9d5c3',
] as const;

// Axis ticks drop the cents (legacy xAxisTickFormatting); tooltips and tables keep
// two decimals via formatCosto from the andamento slice.
const eurInt = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
export const formatEuroInt = (n: number): string => eurInt.format(n);

const meseAnno = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });

// "202607" -> "luglio 2026". The legacy used luxon
// (DateTime.fromFormat(name, 'yyyyMM').setLocale('it-IT').toFormat('MMMM yyyy'));
// Intl produces the same string from the same CLDR data, without the dependency.
export const formatMese = (name: string): string =>
  meseAnno.format(new Date(Number(name.slice(0, 4)), Number(name.slice(4, 6)) - 1, 1));

// Legacy: yearly totals of the last 10 years turned into monthly averages. The
// running year divides by the months elapsed so far, not by 12.
// `now` is injectable so the tests don't depend on the wall clock.
export const mediaMensile = (rows: Statistica[], now: Date = new Date()): Statistica[] => {
  const anno = now.getFullYear();
  const mesiTrascorsi = now.getMonth() + 1;
  return rows
    .filter((r) => Number(r.name) > anno - 10)
    .map((r) => ({
      name: r.name,
      value: r.value / (Number(r.name) === anno ? mesiTrascorsi : 12),
    }));
};

// Parity with ngx-charts schemeType Linear: the value's position within the domain
// picks a stop of the ramp (higher spend = hotter colour).
export const solarColor = (value: number, min: number, max: number): string => {
  const ratio = max === min ? 1 : (value - min) / (max - min);
  const last = SOLAR.length - 1;
  const i = Math.min(last, Math.max(0, Math.round(ratio * last)));
  return SOLAR[i]!;
};

// Ordinal palette for the pie: cycle when there are more slices than colours.
export const naturalColor = (i: number): string => NATURAL[i % NATURAL.length]!;
