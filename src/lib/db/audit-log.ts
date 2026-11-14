import type { AuditAction, AuditEvent, Prisma } from '@prisma/client';
import type { DbTransaction } from './prisma';

export interface AuditEventInput {
  groupId: string;
  /** The signed-in user who made the change, never a client-supplied ID. */
  actorId: string;
  action: AuditAction;
  /** The expense or settlement the event is about. */
  entityId: string;
  /** The record after the change (before it, for deletions), with amounts in integer cents. */
  snapshot: Prisma.InputJsonObject;
}

/**
 * Records one change to a group's financial history (#8). Call it with the `tx` of the same
 * `prisma.$transaction` that makes the change, so a change is never saved without its event and
 * a failed change leaves no event behind. Events are append-only: the database rejects any later
 * UPDATE or DELETE.
 */
export function recordAuditEvent(tx: DbTransaction, event: AuditEventInput): Promise<AuditEvent> {
  return tx.auditEvent.create({ data: event });
}
