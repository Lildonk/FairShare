-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('EXPENSE_CREATED', 'EXPENSE_UPDATED', 'EXPENSE_DELETED', 'EXPENSE_DISPUTED', 'EXPENSE_UNDISPUTED', 'SETTLEMENT_RECORDED', 'SETTLEMENT_STATUS_CHANGED');

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEvent_groupId_createdAt_idx" ON "AuditEvent"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityId_idx" ON "AuditEvent"("entityId");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only audit history, added by hand (Prisma schema cannot express triggers).
-- UPDATE is always rejected. DELETE and TRUNCATE are rejected unless the transaction ran
-- SET LOCAL fairshare.audit_maintenance = 'on', which only test cleanup does; app code never sets it.
-- current_setting(..., true) returns NULL instead of failing when the setting was never set.
-- `prisma migrate reset` still works: dropping the schema fires no row or TRUNCATE triggers.
CREATE FUNCTION "audit_event_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE')
     AND current_setting('fairshare.audit_maintenance', true) IS NOT DISTINCT FROM 'on' THEN
    -- A BEFORE row trigger must return OLD to let the DELETE go ahead (NULL would skip it
    -- silently). Statement-level triggers (TRUNCATE) ignore the return value.
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'AuditEvent is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER "AuditEvent_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION "audit_event_append_only"();

CREATE TRIGGER "AuditEvent_no_truncate"
  BEFORE TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_event_append_only"();
