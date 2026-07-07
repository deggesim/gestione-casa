import { treaty } from '@elysiajs/eden';
import type { App } from '@gc/api';
import { API_URL } from '../config';

// Cookie-based auth: credentials:'include' sends the httpOnly access/refresh cookies.
export const apiClient = treaty<App>(API_URL, {
  fetch: { credentials: 'include' },
});
