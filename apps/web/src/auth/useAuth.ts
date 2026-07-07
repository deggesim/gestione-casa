import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';

// Current user via GET /utente/me. A 401 (no cookie) surfaces as error → not logged in.
// meta.authProbe marks this query's 401 as the normal logged-out state, not an error
// to toast (see query-client.ts's isSilencedAuthProbe).
export const useMe = () =>
  useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data, error } = await apiClient.utente.me.get();
      if (error) throw error;
      return data;
    },
    meta: { authProbe: true },
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
    // Clear (not invalidate) so no refetch fires post-logout — the cookie is
    // gone, so a refetch would just 401 and double the logout success toast.
    onSuccess: () => qc.setQueryData(['me'], null),
  });
};
