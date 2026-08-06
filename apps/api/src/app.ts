import { Elysia } from 'elysia';
import cors from '@elysiajs/cors';
import { CSRF_HEADER } from '@gc/shared-types';
import { env } from './env';
import { withErrorHandling } from './errors';
import { assertCsrf } from './auth/csrf';
import { tipoSpesaRoutes } from './tipo-spesa/tipo-spesa.routes';
import { andamentoRoutes } from './andamento/andamento.routes';
import { utenteRoutes } from './utente/utente.routes';
import { statisticheRoutes } from './statistiche/statistiche.routes';

export const buildApp = () =>
  withErrorHandling(new Elysia())
    .use(
      cors({
        origin: env.CORS_ORIGIN,
        credentials: true,
        // The web client sends exactly these two non-safelisted request headers on
        // mutating JSON requests; the custom CSRF header must be allowed or the
        // cross-origin dev preflight (3000→5000) fails. Do NOT set `methods` — the
        // plugin default allows all verbs; an explicit list would silently break the
        // existing PATCH /utente/me route (added in Phase 2).
        allowedHeaders: ['content-type', CSRF_HEADER],
      }),
    )
    .onRequest(({ request }) => assertCsrf(request))
    .get('/health', () => ({ status: 'ok' }))
    .use(tipoSpesaRoutes)
    .use(andamentoRoutes)
    .use(utenteRoutes)
    .use(statisticheRoutes);

export type App = ReturnType<typeof buildApp>;
