import { CSRF_HEADER } from '@gc/shared-types';
import { ForbiddenError } from '../errors';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Reject state-changing requests that lack the custom CSRF header. Presence is
// the defense (see csrf.ts in shared-types); the value is not inspected.
export const assertCsrf = (request: Request): void => {
  if (!MUTATING.has(request.method)) return;
  const header = request.headers.get(CSRF_HEADER);
  if (!header) throw new ForbiddenError('Richiesta non consentita');
};
