import { type Static, Type } from '@sinclair/typebox';

export const StatisticaSchema = Type.Object({
  name: Type.String(),
  value: Type.Number(),
});
export type Statistica = Static<typeof StatisticaSchema>;

export const StatisticheSchema = Type.Array(StatisticaSchema);
