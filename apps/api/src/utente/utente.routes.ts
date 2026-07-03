import { Elysia, t } from 'elysia';
import { LoginInputSchema } from '@gc/shared-types';
import { db } from '../db/client';
import { jwtConfig, authPlugin } from '../auth/auth.plugin';
import { createUtenteRepository } from './utente.repository';
import { createUtenteService } from './utente.service';

const repo = createUtenteRepository(db);

export const utenteRoutes = new Elysia({ prefix: '/utente' })
  .use(jwtConfig)
  .resolve({ as: 'scoped' }, ({ jwt }) => ({ service: createUtenteService(repo, jwt) }))
  // --- public ---
  .post('/login', ({ body, service }) => service.login(body.email, body.password), {
    body: LoginInputSchema,
  })
  .post(
    '/',
    ({ body, service, set }) => {
      set.status = 201;
      return service.register(body.email, body.password);
    },
    { body: LoginInputSchema },
  )
  // --- guarded ---
  .use(authPlugin)
  .get('/me', ({ utente }) => utente)
  .patch('/me', ({ utente, body, service }) => service.update(utente.id, body.password), {
    body: t.Object({ email: t.Optional(t.String()), password: t.String() }),
  })
  .delete('/me', ({ utente, service }) => service.remove(utente.id))
  .post('/logout', ({ utente, token, service }) => service.logout(utente.id, token))
  .post('/logout-all', ({ utente, service }) => service.logoutAll(utente.id));
