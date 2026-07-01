import type { Elysia } from 'elysia';

export class BadRequestError extends Error {}
export class NotFoundError extends Error {}
export class AuthError extends Error {}

export const withErrorHandling = <T extends Elysia>(app: T) =>
  app.error({ BadRequestError, NotFoundError, AuthError }).onError(({ code, error, status }) => {
    switch (code) {
      case 'BadRequestError':
        return status(400, { message: error.message });
      case 'NotFoundError':
        return status(404, { message: error.message });
      case 'AuthError':
        return status(401, { message: error.message });
      case 'VALIDATION':
        return status(400, { message: error.message });
    }
  });
