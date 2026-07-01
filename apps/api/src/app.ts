import { Elysia } from 'elysia';
import cors from '@elysiajs/cors';
import { env } from './env';

export const buildApp = () =>
  new Elysia()
    .use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
    .get('/health', () => ({ status: 'ok' }));
