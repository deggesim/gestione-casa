import { test, expect } from 'bun:test';
import { Elysia } from 'elysia';
import { withErrorHandling, BadRequestError, NotFoundError, AuthError } from '../src/errors';

const app = withErrorHandling(new Elysia())
  .get('/bad', () => {
    throw new BadRequestError('bad');
  })
  .get('/missing', () => {
    throw new NotFoundError('missing');
  })
  .get('/nope', () => {
    throw new AuthError('nope');
  });

test('BadRequestError → 400', async () => {
  const res = await app.handle(new Request('http://localhost/bad'));
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ message: 'bad' });
});
test('NotFoundError → 404', async () => {
  expect((await app.handle(new Request('http://localhost/missing'))).status).toBe(404);
});
test('AuthError → 401', async () => {
  expect((await app.handle(new Request('http://localhost/nope'))).status).toBe(401);
});
