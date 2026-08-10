import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '../api/client';
import { apiErrorMessage } from './api-error';

// Eden's error is a plain { status, value } object (or null on success) per Treaty.TreatyResponse;
// widened to optional fields here so handleUnauthorized stays decoupled from Eden's exact type.
type EdenError = { status?: number; value?: unknown } | null;
const statusOf = (error: unknown): number | undefined =>
  (error as { status?: number } | null)?.status;

type RecoveryDeps = {
  refresh: () => Promise<{ error: EdenError }>;
  invalidateAll: () => Promise<void>;
  navigate: (path: string) => void;
  onExpired: () => void;
};

const recover = async (deps: RecoveryDeps): Promise<void> => {
  const { error } = await deps.refresh();
  if (error) {
    deps.onExpired();
    deps.navigate('/login');
    return;
  }
  // Refetching everything is what makes a recovered 401 invisible: the queries that just
  // failed are still mounted, so they retry with the fresh access cookie.
  // ponytail: no attempt limit. Ceiling: a refresh that succeeds while the new access cookie
  // still 401s would loop. Both cookies are written together by setAuthCookies, so they fail
  // together — upgrade path if that ever stops holding: a one-attempt-per-success flag reset
  // from a QueryCache onSuccess handler.
  await deps.invalidateAll();
};

// A single in-flight recovery, shared by every 401 in one burst. An expiring access token 401s
// every query on the page at once (andamento + tipo-spesa + me), and the refresh token is
// single-use: N concurrent refreshes rotate it N times, and once that rotate becomes atomic
// (see the ponytail note in apps/api/src/utente/utente.service.ts) all but one would fail and
// bounce the user to /login on every token expiry.
let recovering: Promise<void> | null = null;

// Extracted for unit testing without a live client/router.
export const handleUnauthorized = (deps: RecoveryDeps): Promise<void> => {
  // Callers joining an in-flight recovery discard their own deps, so onExpired and navigate
  // fire once per burst rather than once per failed query. Safe because createQueryClient
  // builds equivalent deps on every call.
  recovering ??= recover(deps).finally(() => {
    recovering = null;
  });
  return recovering;
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

// One QueryClient with global error handling: toast every error; on 401, try one shared
// refresh then either refetch or redirect to /login. Mirrors GlobalInterceptor, except that
// the legacy stack had no refresh endpoint, so every 401 there was a real session expiry.
// The auth-probe ['me'] query is exempt from all of it (see isSilencedAuthProbe).
export const createQueryClient = (navigate: (path: string) => void): QueryClient => {
  const recoverFrom = (onExpired: () => void): void =>
    void handleUnauthorized({
      refresh: () => apiClient.utente.refresh.post(),
      invalidateAll: () => qc.invalidateQueries(),
      navigate,
      onExpired,
    });

  const qc: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isSilencedAuthProbe(error, query)) return;
        if (statusOf(error) === 401) {
          // A 401 the refresh recovers is a non-event — invalidateAll refetches this query, so
          // only a genuinely expired session is worth a toast, and only one per burst.
          recoverFrom(() => notify(error));
          return;
        }
        notify(error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        // Unlike a query, a failed mutation is never replayed by the recovery, so the user has
        // to be told even when the session recovers — a silently lost save looks like a
        // successful one. The recovery therefore stays quiet on this path.
        notify(error);
        if (statusOf(error) === 401) recoverFrom(() => {});
      },
    }),
    defaultOptions: { queries: { retry: false } },
  });
  return qc;
};
