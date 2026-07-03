import { Elysia } from 'elysia';
import cors from '@elysiajs/cors';
import { env } from './env';
import { withErrorHandling } from './errors';
import { tipoSpesaRoutes } from './tipo-spesa/tipo-spesa.routes';
import { andamentoRoutes } from './andamento/andamento.routes';
import { utenteRoutes } from './utente/utente.routes';
import { statisticheRoutes } from './statistiche/statistiche.routes';

export const buildApp = () =>
  withErrorHandling(new Elysia())
    .use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
    .get('/health', () => ({ status: 'ok' }))
    .use(tipoSpesaRoutes)
    .use(andamentoRoutes)
    .use(utenteRoutes)
    .use(statisticheRoutes);
