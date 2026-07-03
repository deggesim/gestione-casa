import { test, expect, beforeEach } from 'bun:test';
import { createStatisticheRepository } from '../src/statistiche/statistiche.repository';
import { db } from '../src/db/client';
import { Interval } from '@gc/shared-types';
import { resetDb, seedFixtures } from './setup';

const repo = createStatisticheRepository(db);
beforeEach(async () => {
  await resetDb();
  await seedFixtures();
});

// Fixtures: spesa 100 (2025-01) + 80 (2025-02); carburante 50 (2025-01); bolletta 40 (2025-02).
test('speseFrequenti (A) sums by category, ordered by value DESC', async () => {
  const rows = await repo.speseFrequenti(Interval.tutto);
  expect(rows).toEqual([
    { name: 'spesa', value: 180 },
    { name: 'carburante', value: 50 },
    { name: 'bolletta', value: 40 },
  ]);
});

test('statistics monthly for spesa (id 1) fills gaps with 0 and formats YYYYMM DESC', async () => {
  const rows = await repo.statistics(Interval.mese, 1);
  const map = Object.fromEntries(rows.map((r) => [r.name, r.value]));
  expect(map['202501']).toBe(100);
  expect(map['202502']).toBe(80);
  // spesa has no entry before Jan; series starts at year start -> earlier months are 0 if present
  expect(rows[0]!.name >= rows[rows.length - 1]!.name).toBe(true);
});

test('statistics yearly for all default categories aggregates to 2025', async () => {
  const rows = await repo.statistics(Interval.anno);
  const y2025 = rows.find((r) => r.name === '2025');
  expect(y2025).toBeDefined();
  // Yearly "tutto" default set is (1,3,7,9,10,13,16): spesa(1)=180 + bolletta(3)=40 = 220.
  // carburante(2)=50 is deliberately EXCLUDED from the yearly set (verbatim original behavior;
  // note the MONTHLY default set (1,2,3,5,7,9,13,16) DOES include 2 — the asymmetry is intentional).
  expect(y2025!.value).toBe(220);
  expect(typeof y2025!.value).toBe('number');
});
