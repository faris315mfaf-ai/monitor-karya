-- 0016 — fitur Admin PT (6 Okt 2026, 04-admin-pt.md): permintaan akses dan
-- pengingat otomatis per PT. Ditulis tangan; jalankan lewat prisma migrate deploy.

CREATE TABLE "AccessRequest" (
  "id"            TEXT NOT NULL,
  "type"          TEXT NOT NULL,
  "payload"       TEXT NOT NULL,
  "reason"        TEXT,
  "entityId"      TEXT,
  "requestedById" TEXT,
  "targetUserId"  TEXT,
  "status"        TEXT NOT NULL DEFAULT 'DIAJUKAN',
  "decidedById"   TEXT,
  "decidedAt"     TIMESTAMP(3),
  "decisionNote"  TEXT,
  "expiresAt"     TIMESTAMP(3),
  "appliedData"   TEXT,
  "revertedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccessRequest_entityId_status_idx" ON "AccessRequest"("entityId", "status");
CREATE INDEX "AccessRequest_requestedById_idx" ON "AccessRequest"("requestedById");
CREATE INDEX "AccessRequest_targetUserId_idx" ON "AccessRequest"("targetUserId");
CREATE INDEX "AccessRequest_status_expiresAt_idx" ON "AccessRequest"("status", "expiresAt");
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessRequest" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "ReminderRule" (
  "id"          TEXT NOT NULL,
  "entityId"    TEXT NOT NULL,
  "kind"        TEXT NOT NULL,
  "enabled"     BOOLEAN NOT NULL DEFAULT true,
  "time"        TEXT,
  "weekday"     INTEGER,
  "params"      TEXT,
  "lastRunAt"   TIMESTAMP(3),
  "updatedById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReminderRule_entityId_kind_key" ON "ReminderRule"("entityId", "kind");
CREATE INDEX "ReminderRule_updatedById_idx" ON "ReminderRule"("updatedById");
ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReminderRule" ENABLE ROW LEVEL SECURITY;
