import { type Static, Type } from '@sinclair/typebox';

export const UtenteSchema = Type.Object({
  id: Type.Optional(Type.Number()),
  email: Type.String(),
});
export type Utente = Static<typeof UtenteSchema>;

export const LoginInputSchema = Type.Object({
  email: Type.String(),
  password: Type.String(),
});
export type LoginInput = Static<typeof LoginInputSchema>;
