import { AuthError, BadRequestError } from '../errors';
import { ACCESS_TTL, REFRESH_TTL } from '../auth/cookies';
import type { createUtenteRepository } from './utente.repository';

type Jwt = {
  sign: (payload: { id: string; type: 'access' | 'refresh'; exp: string }) => Promise<string>;
  verify: (token?: string) => Promise<false | Record<string, unknown>>;
};

const hash = (password: string) => Bun.password.hash(password, { algorithm: 'bcrypt', cost: 8 });

export const createUtenteService = (repo: ReturnType<typeof createUtenteRepository>, jwt: Jwt) => {
  // Mint a fresh pair and persist the refresh token for this user.
  const issue = async (id: number, email: string) => {
    const access = await jwt.sign({ id: String(id), type: 'access', exp: ACCESS_TTL });
    const refresh = await jwt.sign({ id: String(id), type: 'refresh', exp: REFRESH_TTL });
    await repo.addToken(id, refresh);
    return { utente: { id, email }, access, refresh };
  };

  return {
    register: async (email: string, password: string) => {
      const created = await repo.create(email, await hash(password));
      return { id: created.id, email: created.email };
    },
    login: async (email: string, password: string) => {
      const found = await repo.findByEmail(email);
      if (!found || !(await Bun.password.verify(password, found.password)))
        throw new AuthError('Email o password errate');
      return issue(found.id, found.email);
    },
    refresh: async (rawRefresh: string) => {
      const payload = rawRefresh ? await jwt.verify(rawRefresh) : false;
      if (!payload || payload.type !== 'refresh' || typeof payload.id !== 'string')
        throw new AuthError('Refresh token non valido');
      const id = Number(payload.id);
      if (!Number.isInteger(id)) throw new AuthError('Refresh token non valido');
      const stored = await repo.findToken(id, rawRefresh);
      if (!stored) throw new AuthError('Sessione scaduta');
      const found = await repo.findById(id);
      if (!found) throw new AuthError('Utente non trovato');
      // Rotate: the used refresh token is single-use.
      // ponytail: non-atomic (findToken → removeToken → issue); two simultaneous
      // refreshes with the same cookie could double-issue. Fine for a single-user
      // household app. Upgrade path if multi-device concurrency matters: UNIQUE(token)
      // + a transaction or SELECT ... FOR UPDATE around the rotate.
      await repo.removeToken(id, rawRefresh);
      return issue(found.id, found.email);
    },
    update: async (id: number, email: string | undefined, password: string) => {
      if (!password) throw new BadRequestError('Password richiesta');
      await repo.update(id, { email, passwordHash: await hash(password) });
      // Credential change invalidates every existing session.
      await repo.removeAllTokens(id);
      const found = await repo.findById(id);
      return { id: found!.id, email: found!.email };
    },
    logout: (id: number, rawRefresh: string) => repo.removeToken(id, rawRefresh),
    logoutAll: (id: number) => repo.removeAllTokens(id),
    remove: async (id: number) => {
      await repo.removeAllTokens(id); // clear FK rows before deleting the user
      await repo.remove(id);
    },
  };
};
