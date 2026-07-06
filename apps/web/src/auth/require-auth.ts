import { redirect } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';

// beforeLoad guard: ensures ['me'] is loadable; a failed fetch → redirect to /login.
export const requireAuth = (queryClient: QueryClient) => async () => {
  try {
    await queryClient.ensureQueryData({
      queryKey: ['me'],
      queryFn: async () => {
        const { data, error } = await apiClient.utente.me.get();
        if (error) throw error;
        return data;
      },
    });
  } catch {
    throw redirect({ to: '/login' });
  }
};
