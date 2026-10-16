import { type Static, Type } from '@sinclair/typebox';
import { TipoSpesaSchema } from './tipo-spesa';

export const AndamentoSchema = Type.Object({
  id: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  giorno: Type.String(), // ISO date "YYYY-MM-DD" (wire is a string; repo formats the bun-sql Date)
  descrizione: Type.String(),
  // No `minimum` here: this is the RESPONSE/domain schema and must faithfully return
  // stored data, including legacy rows with costo 0.00 (Elysia validates responses, so a
  // floor here 400s the whole GET). The 0.01 floor lives on AndamentoInputSchema
  // (create/update), matching the legacy form's Validators.min(0.01).
  costo: Type.Number(),
  tipoSpesa: TipoSpesaSchema,
});
export type Andamento = Static<typeof AndamentoSchema>;

// Body accepted on create/update (id optional, tipoSpesa may carry just an id).
export const AndamentoInputSchema = Type.Object({
  id: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  giorno: Type.String(),
  descrizione: Type.String(),
  costo: Type.Number({ minimum: 0.01 }),
  tipoSpesa: Type.Object({ id: Type.Number() }),
});
export type AndamentoInput = Static<typeof AndamentoInputSchema>;

// Query of GET /andamento. Everything is optional: the service applies the defaults
// (page 1, pageSize 10, giorno desc), so a bare `GET /andamento` is still a valid call.
//
// Integers are `Number + multipleOf: 1`, not `Type.Integer`: Elysia coerces the query
// STRING "2" only for Number (the same mechanism that makes `params: { id: t.Number() }`
// work); an Integer schema rejects it with "Expected integer" and every page request 400s.
export const AndamentoQuerySchema = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, multipleOf: 1 })),
  pageSize: Type.Optional(Type.Number({ minimum: 1, maximum: 100, multipleOf: 1 })),
  q: Type.Optional(Type.String()),
  sort: Type.Optional(
    Type.Union([Type.Literal('giorno'), Type.Literal('descrizione'), Type.Literal('costo')]),
  ),
  dir: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')])),
});
export type AndamentoQuery = Static<typeof AndamentoQuerySchema>;

// `page` / `pageSize` are the EFFECTIVE values: the server clamps a page past the end,
// so the client re-syncs from the response instead of trusting what it asked for.
export const AndamentoPageSchema = Type.Object({
  items: Type.Array(AndamentoSchema),
  total: Type.Integer({ minimum: 0 }),
  page: Type.Integer({ minimum: 1 }),
  pageSize: Type.Integer({ minimum: 1 }),
});
export type AndamentoPage = Static<typeof AndamentoPageSchema>;
