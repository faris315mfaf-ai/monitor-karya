-- CX20: indeks komposit untuk kueri heartbeat operasional.
-- Mempercepat pencarian AuditLog terbaru per job (targetType=OPERATIONAL_JOB,
-- targetId tetap, urut at). Additive saja; nama indeks memakai konvensi baku
-- Prisma (AuditLog_targetType_targetId_at_idx) sehingga cocok dengan
-- deklarasi @@index pada schema.prisma tanpa map:.
CREATE INDEX IF NOT EXISTS "AuditLog_targetType_targetId_at_idx" ON "AuditLog" ("targetType", "targetId", "at");
