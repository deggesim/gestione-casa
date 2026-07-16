import { test, expect } from 'bun:test';
import { toYmd } from '../src/andamento/andamento.repository';

// Regression: bun-sql hands PG `date` back as a JS Date, but `instanceof Date` is
// unreliable across module realms (bun --watch), so the old code passed the Date
// through unsliced and it serialized as a full ISO timestamp — breaking GET /andamento
// and the web's formatGiorno. toYmd must normalize every representation to "YYYY-MM-DD".
test('toYmd: JS Date -> YYYY-MM-DD', () => {
  expect(toYmd(new Date('2026-07-13T00:00:00.000Z'))).toBe('2026-07-13');
});

test('toYmd: date-only string passes through', () => {
  expect(toYmd('2026-07-13')).toBe('2026-07-13');
});

test('toYmd: full ISO timestamp string is trimmed to the date (the dev-server bug)', () => {
  expect(toYmd('2026-07-13T00:00:00.000Z')).toBe('2026-07-13');
});
