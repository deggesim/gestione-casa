import { Elysia } from 'elysia';
import jwtPlugin from '@elysiajs/jwt';
import { env } from '../env';
import { AuthError } from '../errors';
import { db } from '../db/client';
import { ACCESS_COOKIE } from './cookies';
import { createUtenteRepository } from '../utente/utente.repository';

const repo = createUtenteRepository(db);

// No default `exp`: access (15m) and refresh (14d) set expiry per-sign.
export const jwtConfig = jwtPlugin({ name: 'jwt', secret: env.JWT_SECRET });

export const authPlugin = new Elysia({ name: 'auth' })
  .use(jwtConfig)
  .derive({ as: 'scoped' }, async ({ jwt, cookie }) => {
    const raw = cookie[ACCESS_COOKIE]?.value;
    if (typeof raw !== 'string' || !raw) throw new AuthError('Non autenticato');
    const payload = await jwt.verify(raw);
    if (!payload || payload.type !== 'access' || typeof payload.id !== 'string')
      throw new AuthError('Token non valido');
    const id = Number(payload.id);
    if (!Number.isInteger(id)) throw new AuthError('Token non valido');
    const found = await repo.findById(id);
    if (!found) throw new AuthError('Utente non trovato');
    return { utente: { id: found.id, email: found.email } };
  });
