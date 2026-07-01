import { test, expect } from 'bun:test';
import { Value } from '@sinclair/typebox/value';
import { Interval, IntervalSchema } from './interval';

test('Interval enum matches server values', () => {
  expect(Interval.mese as string).toBe('M');
  expect(Interval.anno as string).toBe('Y');
  expect(Interval.tutto as string).toBe('A');
});

test('IntervalSchema accepts M/Y/A and rejects others', () => {
  expect(Value.Check(IntervalSchema, 'M')).toBe(true);
  expect(Value.Check(IntervalSchema, 'X')).toBe(false);
});
