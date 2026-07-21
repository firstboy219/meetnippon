import type { Participant } from './types';

/**
 * The exact shape the API accepts for a participant.
 *
 * `Participant` also carries a `name` so chips can show "Bob Builder" instead
 * of an email address — but that field is display-only. The API validates with
 * `forbidNonWhitelisted`, so sending the whole object back is a 400
 * ("participants.0.property name should not exist").
 *
 * Every call site must send `toWire(...)` rather than the raw list. Keeping the
 * conversion here — next to the type — is what stops the display shape and the
 * wire shape drifting apart again.
 */
export interface ParticipantWire {
  userId?: string;
  email: string;
  external?: boolean;
}

export function toWire(participants: Participant[]): ParticipantWire[] {
  return participants.map((p) => ({
    ...(p.userId ? { userId: p.userId } : {}),
    email: p.email,
    ...(p.external ? { external: true } : {}),
  }));
}
