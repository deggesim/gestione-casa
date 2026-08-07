import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';

// PATCH /utente/me revokes every refresh token server-side (utente.service.ts) and clears
// the session cookies, so a successful save always logs the user out. The caller is
// responsible for sending them to /login.
export const useSaveProfilo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const { data, error } = await apiClient.utente.me.patch(input);
      if (error) throw error;
      return data;
    },
    // Clear rather than invalidate: the cookie is gone, so a refetch would only 401.
    // Same reasoning as useLogout in auth/useAuth.ts.
    onSuccess: () => qc.setQueryData(['me'], null),
  });
};
