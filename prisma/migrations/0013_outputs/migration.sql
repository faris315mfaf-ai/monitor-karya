-- 0013 — output proyek yang direview kepala divisi (6 Okt 2026).

CREATE TABLE "Output" (
  "id"           TEXT NOT NULL,
  "projectId"    TEXT NOT NULL,
  "title"        TEXT NOT NULL,
  "description"  TEXT,
  "status"       TEXT NOT NULL DEFAULT 'DIKERJAKAN',
  "dueDate"      TIMESTAMP(3),
  "ownerId"      TEXT NOT NULL,
  "reviewerId"   TEXT,
  "revisionNote" TEXT,
  "submittedAt"  TIMESTAMP(3),
  "reviewedAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Output_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Output_projectId_status_idx" ON "Output"("projectId", "status");
CREATE INDEX "Output_ownerId_idx" ON "Output"("ownerId");
ALTER TABLE "Output" ADD CONSTRAINT "Output_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Output" ADD CONSTRAINT "Output_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Output" ADD CONSTRAINT "Output_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Output" ENABLE ROW LEVEL SECURITY;
