import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AndamentoInput } from '@gc/shared-types';
import { apiClient } from '../api/client';
import type { ListSearch } from './list-utils';

export type ListParams = ListSearch & { pageSize: number };

// The key carries the params, so every page/filter/sort is its own cache entry; the
// mutations below invalidate by the bare ['andamento'] prefix and so refresh all of them.
// keepPreviousData holds the old page on screen while the next one loads (no blank table).
export const useAndamentoList = (params: ListParams) =>
  useQuery({
    queryKey: ['andamento', params],
    queryFn: async () => {
      const { q, ...rest } = params;
      const { data, error } = await apiClient.andamento.get({
        query: q ? { ...rest, q } : rest,
      });
      if (error) throw error;
      return data;
    },
    placeholderData: keepPreviousData,
  });

export const useTipoSpesaList = () =>
  useQuery({
    queryKey: ['tipo-spesa'],
    queryFn: async () => {
      const { data, error } = await apiClient['tipo-spesa'].get();
      if (error) throw error;
      return data;
    },
  });

// Create (no id) or update (id present) — mirrors the legacy `salva()`.
export const useSaveAndamento = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AndamentoInput) => {
      const { data, error } =
        input.id != null
          ? await apiClient.andamento({ id: input.id }).put(input)
          : await apiClient.andamento.post(input);
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['andamento'] }),
  });
};

export const useDeleteAndamento = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await apiClient.andamento({ id }).delete();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['andamento'] }),
  });
};
