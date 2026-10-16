import { test, expect } from 'bun:test';
import {
  formatCosto,
  formatGiorno,
  compactSearch,
  DEFAULT_SEARCH,
  pageWindow,
  parseListSearch,
} from '../src/andamento/list-utils';

test('formatGiorno renders dd/MM/yyyy without timezone drift', () => {
  expect(formatGiorno('2025-01-09')).toBe('09/01/2025');
});

test('formatCosto renders an it-IT EUR amount', () => {
  // Non-breaking spaces vary by ICU; assert the stable parts.
  const s = formatCosto(1234.5);
  expect(s).toContain('€');
  expect(s).toContain('1.234,50');
});

test('parseListSearch keeps valid values, accepting the numeric strings a hand-typed URL carries', () => {
  expect(parseListSearch({ page: 3, q: 'pane', sort: 'costo', dir: 'asc' })).toEqual({
    page: 3,
    q: 'pane',
    sort: 'costo',
    dir: 'asc',
  });
  expect(parseListSearch({ page: '2' })).toEqual({ page: 2 });
});

test('parseListSearch turns a numeric q back into a string (the router JSON-parses ?q=2025 to a number)', () => {
  expect(parseListSearch({ q: 2025 })).toEqual({ q: '2025' });
});

test('parseListSearch drops malformed values instead of throwing (a bad link must not hit the error page)', () => {
  const junk = { page: 0, q: { a: 1 }, sort: 'id', dir: 'up' };
  expect(parseListSearch(junk)).toEqual({});
  for (const page of [-1, 1.5, 'abc', null, NaN]) expect(parseListSearch({ page })).toEqual({});
});

test('compactSearch omits defaults so the canonical URL stays clean', () => {
  expect(compactSearch(DEFAULT_SEARCH)).toEqual({});
  expect(compactSearch({ page: 2, q: 'pane', sort: 'costo', dir: 'asc' })).toEqual({
    page: 2,
    q: 'pane',
    sort: 'costo',
    dir: 'asc',
  });
  // sort and dir are independent: a non-default dir alone is kept
  expect(compactSearch({ ...DEFAULT_SEARCH, dir: 'asc' })).toEqual({ dir: 'asc' });
});

test('pageWindow returns up to 5 consecutive pages, clamped and centered', () => {
  expect(pageWindow(1, 2)).toEqual([1, 2]); // fewer than window
  expect(pageWindow(1, 8)).toEqual([1, 2, 3, 4, 5]); // start
  expect(pageWindow(4, 8)).toEqual([2, 3, 4, 5, 6]); // centered
  expect(pageWindow(8, 8)).toEqual([4, 5, 6, 7, 8]); // clamped at end
  expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
});
