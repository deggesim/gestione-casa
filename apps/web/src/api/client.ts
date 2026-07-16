import { treaty } from '@elysiajs/eden';
import type { App } from '@gc/api';
import { CSRF_HEADER, CSRF_VALUE } from '@gc/shared-types';
import { API_URL } from '../config';

// Cookie-based auth: credentials:'include' sends the httpOnly access/refresh cookies.
// CSRF: a custom header on every request (mutating routes require it server-side).
export const apiClient = treaty<App>(API_URL, {
  fetch: { credentials: 'include' },
  headers: { [CSRF_HEADER]: CSRF_VALUE },
});
