import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AndamentoInput } from '@gc/shared-types';
import { apiClient } from '../api/client';

export const useAndamentoList = () =>
  useQuery({
    queryKey: ['andamento'],
    queryFn: async () => {
      const { data, error } = await apiClient.andamento.get();
      if (error) throw error;
      return data;
    },
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
