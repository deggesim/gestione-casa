import { useQuery } from '@tanstack/react-query';
import type { IntervalValue } from '@gc/shared-types';
import { apiClient } from '../api/client';

// One thunk per endpoint instead of indexing the Eden client with a union key:
// a union of call signatures isn't reliably callable under TS, and the explicit
// map costs the same four lines.
const fetchers = {
  spesa: (interval: IntervalValue) => apiClient.statistiche.spesa({ interval }).get(),
  carburante: (interval: IntervalValue) => apiClient.statistiche.carburante({ interval }).get(),
  bolletta: (interval: IntervalValue) => apiClient.statistiche.bolletta({ interval }).get(),
  casa: (interval: IntervalValue) => apiClient.statistiche.casa({ interval }).get(),
};

export type StatisticaKind = keyof typeof fetchers;

export const useStatistica = (kind: StatisticaKind, interval: IntervalValue) =>
  useQuery({
    queryKey: ['statistiche', kind, interval],
    queryFn: async () => {
      const { data, error } = await fetchers[kind](interval);
      if (error) throw error;
      return data;
    },
  });

export const useSpeseFrequenti = (interval: IntervalValue) =>
  useQuery({
    queryKey: ['statistiche', 'spese-frequenti', interval],
    queryFn: async () => {
      const { data, error } = await apiClient.statistiche['spese-frequenti']({ interval }).get();
      if (error) throw error;
      return data;
    },
  });

// The "spese comuni" table is always yearly (the legacy StatisticheCompleteResolver
// hardcodes 'Y'); the radio on that screen only drives the pie.
export const useTutto = () =>
  useQuery({
    queryKey: ['statistiche', 'tutto', 'Y'],
    queryFn: async () => {
      const { data, error } = await apiClient.statistiche.tutto({ interval: 'Y' }).get();
      if (error) throw error;
      return data;
    },
  });
