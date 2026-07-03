import { type Static, Type } from '@sinclair/typebox';

export const MessageSchema = Type.Object({ message: Type.String() });
export type Message = Static<typeof MessageSchema>;
