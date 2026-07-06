import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';

// Current user via GET /utente/me. A 401 (no cookie) surfaces as error → not logged in.
export const useMe = () =>
  useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data, error } = await apiClient.utente.me.get();
      if (error) throw error;
      return data;
    },
  });

export const useLogin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (creds: { email: string; password: string }) => {
      const { data, error } = await apiClient.utente.login.post(creds);
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
};

export const useLogout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await apiClient.utente.logout.post();
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
};
