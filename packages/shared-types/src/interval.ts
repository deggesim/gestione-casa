import { type Static, Type } from '@sinclair/typebox';

export enum Interval {
  mese = 'M',
  anno = 'Y',
  tutto = 'A',
}

export const IntervalSchema = Type.Union([Type.Literal('M'), Type.Literal('Y'), Type.Literal('A')]);

export type IntervalValue = Static<typeof IntervalSchema>;
