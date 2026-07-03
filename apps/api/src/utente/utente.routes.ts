import { Elysia } from 'elysia';
import { LoginInputSchema, UpdateMeInputSchema } from '@gc/shared-types';
import { db } from '../db/client';
import { jwtConfig, authPlugin } from '../auth/auth.plugin';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  ACCESS_MAX_AGE,
  REFRESH_MAX_AGE,
  authCookieOptions,
} from '../auth/cookies';
import { createUtenteRepository } from './utente.repository';
import { createUtenteService } from './utente.service';

const repo = createUtenteRepository(db);

type Jar = Record<string, { set: (c: Record<string, unknown>) => unknown }>;

const setSession = (cookie: Jar, access: string, refresh: string) => {
  cookie[ACCESS_COOKIE]!.set({ value: access, ...authCookieOptions(ACCESS_MAX_AGE) });
  cookie[REFRESH_COOKIE]!.set({ value: refresh, ...authCookieOptions(REFRESH_MAX_AGE) });
};

const clearSession = (cookie: Jar) => {
  cookie[ACCESS_COOKIE]!.set({ value: '', ...authCookieOptions(0) });
  cookie[REFRESH_COOKIE]!.set({ value: '', ...authCookieOptions(0) });
};

export const utenteRoutes = new Elysia({ prefix: '/utente' })
  .use(jwtConfig)
  .resolve({ as: 'scoped' }, ({ jwt }) => ({ service: createUtenteService(repo, jwt) }))
  // --- public ---
  .post(
    '/login',
    async ({ body, service, cookie }) => {
      const { utente, access, refresh } = await service.login(body.email, body.password);
      setSession(cookie as unknown as Jar, access, refresh);
      return { utente };
    },
    { body: LoginInputSchema },
  )
  .post(
    '/',
    ({ body, service, set }) => {
      set.status = 201;
      return service.register(body.email, body.password);
    },
    { body: LoginInputSchema },
  )
  .post('/refresh', async ({ cookie, service }) => {
    const raw = cookie[REFRESH_COOKIE]?.value;
    const { utente, access, refresh } = await service.refresh(typeof raw === 'string' ? raw : '');
    setSession(cookie as unknown as Jar, access, refresh);
    return { utente };
  })
  // --- guarded ---
  .use(authPlugin)
  .get('/me', ({ utente }) => utente)
  .patch(
    '/me',
    async ({ utente, body, service, cookie }) => {
      const updated = await service.update(utente.id, body.email, body.password);
      clearSession(cookie as unknown as Jar); // force re-auth after credential change
      return updated;
    },
    { body: UpdateMeInputSchema },
  )
  .delete('/me', async ({ utente, service, cookie }) => {
    await service.remove(utente.id);
    clearSession(cookie as unknown as Jar);
    return { message: 'ok' };
  })
  .post('/logout', async ({ utente, service, cookie }) => {
    const raw = cookie[REFRESH_COOKIE]?.value;
    await service.logout(utente.id, typeof raw === 'string' ? raw : '');
    clearSession(cookie as unknown as Jar);
    return { message: 'ok' };
  })
  .post('/logout-all', async ({ utente, service, cookie }) => {
    await service.logoutAll(utente.id);
    clearSession(cookie as unknown as Jar);
    return { message: 'ok' };
  });
