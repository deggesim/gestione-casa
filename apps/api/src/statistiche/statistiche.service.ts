import { Interval } from '@gc/shared-types';
import type { createStatisticheRepository } from './statistiche.repository';

export const createStatisticheService = (repo: ReturnType<typeof createStatisticheRepository>) => ({
  speseFrequenti: (i: Interval) => repo.speseFrequenti(i),
  spesa: (i: Interval) => repo.statistics(i, 1),
  carburante: (i: Interval) => repo.statistics(i, 2),
  bolletta: (i: Interval) => repo.statistics(i, 3),
  casa: (i: Interval) => repo.statistics(i, 7),
  tutto: (i: Interval) => repo.statistics(i),
});
