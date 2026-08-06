import { treaty } from '@elysiajs/eden';
import type { App } from '@gc/api';
import { CSRF_HEADER, CSRF_VALUE } from '@gc/shared-types';
import { API_URL } from '../config';

// Cookie-based auth: credentials:'include' sends the httpOnly access/refresh cookies.
// CSRF: a custom header on every request (mutating routes require it server-side).
// parseDate:false — Eden's JSON reviver defaults to turning any date-looking string into a
// Date, so `giorno` ("2026-07-13") arrived as a Date at local midnight-UTC (02:00 in Rome),
// breaking formatGiorno and the date inputs while the wire and the TypeBox types both said
// string. Keep responses exactly as the API serialized them.
export const apiClient = treaty<App>(API_URL, {
  fetch: { credentials: 'include' },
  headers: { [CSRF_HEADER]: CSRF_VALUE },
  parseDate: false,
});
