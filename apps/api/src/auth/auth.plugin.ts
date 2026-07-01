import { Elysia } from 'elysia';
import jwtPlugin from '@elysiajs/jwt';
import { env } from '../env';
import { AuthError } from '../errors';
import { db } from '../db/client';
import { createUtenteRepository } from '../utente/utente.repository';

const repo = createUtenteRepository(db);

// 14d expiry matches the current server. HS256 is the plugin default.
export const jwtConfig = jwtPlugin({ name: 'jwt', secret: env.JWT_SECRET, exp: '14d' });

export const authPlugin = new Elysia({ name: 'auth' })
  .use(jwtConfig)
  .derive({ as: 'scoped' }, async ({ jwt, headers }) => {
    const raw = headers.authorization?.replace('Bearer ', '');
    if (!raw) throw new AuthError('Token mancante');
    const payload = await jwt.verify(raw);
    if (!payload || typeof payload.id !== 'string') throw new AuthError('Token non valido');
    const found = await repo.findById(Number(payload.id));
    if (!found) throw new AuthError('Utente non trovato');
    return { utente: { id: found.id, email: found.email }, token: raw };
  });
