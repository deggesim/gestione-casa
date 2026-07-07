import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '../api/client';
import { apiErrorMessage } from './api-error';

// Eden's error is a plain { status, value } object (or null on success) per Treaty.TreatyResponse;
// widened to optional fields here so handleUnauthorized stays decoupled from Eden's exact type.
type EdenError = { status?: number; value?: unknown } | null;
const statusOf = (error: unknown): number | undefined =>
  (error as { status?: number } | null)?.status;

// Extracted for unit testing without a live client/router.
export const handleUnauthorized = async (deps: {
  refresh: () => Promise<{ error: EdenError }>;
  invalidateMe: () => Promise<void>;
  navigate: (path: string) => void;
}) => {
  const { error } = await deps.refresh();
  if (error) deps.navigate('/login');
  else await deps.invalidateMe();
};

// Server-provided error text from an Eden error, if any (string body, or {message}/{error}).
export const errorBody = (error: unknown): string | undefined => {
  const v = (error as { value?: unknown } | null)?.value;
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const o = v as { message?: unknown; error?: unknown };
    if (typeof o.message === 'string') return o.message;
    if (typeof o.error === 'string') return o.error;
  }
  return undefined;
};

const notify = (error: unknown) => {
  const status = statusOf(error) ?? 0;
  const { title, message } = apiErrorMessage(status, errorBody(error));
  toast.error(title, { description: message });
};

// A 401 from an auth-probe query (['me']) is the normal logged-out state, not an
// error to surface (login screen / route guard both run this probe unauthenticated).
export const isSilencedAuthProbe = (
  error: unknown,
  query?: { meta?: Record<string, unknown> },
): boolean => query?.meta?.['authProbe'] === true && statusOf(error) === 401;

// One QueryClient with global error handling: toast every error; on 401, try one
// refresh then either refetch (['me']) or redirect to /login. Mirrors GlobalInterceptor.
// The auth-probe ['me'] query is exempt (see isSilencedAuthProbe) — mutations have no
// such exemption, so MutationCache keeps the plain handler.
export const createQueryClient = (navigate: (path: string) => void): QueryClient => {
  const onError = (error: unknown) => {
    notify(error);
    if (statusOf(error) === 401) {
      void handleUnauthorized({
        refresh: () => apiClient.utente.refresh.post(),
        invalidateMe: () => qc.invalidateQueries({ queryKey: ['me'] }),
        navigate,
      });
    }
  };
  const qc: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isSilencedAuthProbe(error, query)) return;
        onError(error);
      },
    }),
    mutationCache: new MutationCache({ onError: (error) => onError(error) }),
    defaultOptions: { queries: { retry: false } },
  });
  return qc;
};
