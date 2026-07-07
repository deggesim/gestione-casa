import { test, expect } from 'bun:test';
import { apiErrorMessage } from '../src/query/api-error';

test('maps known statuses to the Italian title/message pairs', () => {
  expect(apiErrorMessage(401)).toEqual({
    title: 'Utente non loggato',
    message: "L'utente non è loggato o la sessione è scaduta",
  });
  expect(apiErrorMessage(400)).toEqual({
    title: 'Errore nella richiesta',
    message: 'I dati inseriti sono errati',
  });
  expect(apiErrorMessage(500)).toEqual({
    title: 'Errore server',
    message: 'Si è verificato un errore imprevisto',
  });
});

test('falls back to the generic pair for unknown statuses', () => {
  expect(apiErrorMessage(418)).toEqual({
    title: 'Problema generico',
    message: 'Si è verificato un errore imprevisto',
  });
});

test('422 prefers the server-provided body text as message', () => {
  expect(apiErrorMessage(422, 'costo troppo basso').message).toBe('costo troppo basso');
});
