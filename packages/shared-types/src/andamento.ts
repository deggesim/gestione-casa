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
