import { test, expect } from 'bun:test';
import {
  formatEuroInt,
  formatMese,
  mediaMensile,
  naturalColor,
  NATURAL,
  solarColor,
  SOLAR,
} from '../src/statistiche/stats-utils';

test('formatMese turns "YYYYMM" into the Italian month + year', () => {
  expect(formatMese('202607')).toBe('luglio 2026');
  expect(formatMese('202601')).toBe('gennaio 2026');
  expect(formatMese('199912')).toBe('dicembre 1999');
});

test('formatEuroInt formats euros with no decimals', () => {
  expect(formatEuroInt(1234.56)).toBe('1.235 €');
});

test('mediaMensile divides past years by 12 and the running year by months elapsed', () => {
  const now = new Date(2026, 6, 15); // July 2026 -> getMonth() 6 -> divisor 7
  const rows = [
    { name: '2026', value: 700 },
    { name: '2025', value: 1200 },
  ];
  expect(mediaMensile(rows, now)).toEqual([
    { name: '2026', value: 100 },
    { name: '2025', value: 100 },
  ]);
});

test('mediaMensile divides by 1 in January of the running year', () => {
  const now = new Date(2026, 0, 3); // getMonth() 0 -> divisor 1
  expect(mediaMensile([{ name: '2026', value: 42 }], now)).toEqual([{ name: '2026', value: 42 }]);
});

test('mediaMensile keeps only the last 10 years (strictly greater than year - 10)', () => {
  const now = new Date(2026, 6, 15);
  const rows = [
    { name: '2017', value: 12 }, // 2017 > 2016 -> kept
    { name: '2016', value: 12 }, // 2016 > 2016 is false -> dropped
    { name: '2010', value: 12 },
  ];
  expect(mediaMensile(rows, now).map((r) => r.name)).toEqual(['2017']);
});

test('mediaMensile on an empty list returns an empty list', () => {
  expect(mediaMensile([], new Date(2026, 6, 15))).toEqual([]);
});

test('solarColor maps the value onto the SOLAR ramp', () => {
  expect(solarColor(0, 0, 100)).toBe(SOLAR[0]!);
  expect(solarColor(100, 0, 100)).toBe(SOLAR[SOLAR.length - 1]!);
  expect(solarColor(50, 0, 100)).toBe(SOLAR[Math.round((SOLAR.length - 1) / 2)]!);
});

test('solarColor returns the top stop when the domain is degenerate', () => {
  expect(solarColor(7, 7, 7)).toBe(SOLAR[SOLAR.length - 1]!);
});

test('naturalColor cycles through the NATURAL palette', () => {
  expect(naturalColor(0)).toBe(NATURAL[0]!);
  expect(naturalColor(NATURAL.length)).toBe(NATURAL[0]!);
  expect(naturalColor(NATURAL.length + 2)).toBe(NATURAL[2]!);
});
