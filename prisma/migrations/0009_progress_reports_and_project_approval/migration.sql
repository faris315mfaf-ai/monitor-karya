-- 0009 — laporan kemajuan mingguan/bulanan per proyek, pengajuan & persetujuan
-- proyek, dan urgensi task (7 Sep 2026).

-- Task: empat kategori urgensi, bawaan SEDANG.
ALTER TABLE "Task" ADD COLUMN "urgency" TEXT NOT NULL DEFAULT 'SEDANG';

-- Project: siapa mengajukan, kapan, dan penjelasannya.
ALTER TABLE "Project" ADD COLUMN "description" TEXT;
ALTER TABLE "Project" ADD COLUMN "proposedById" TEXT;
ALTER TABLE "Project" ADD COLUMN "proposedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD CONSTRAINT "Project_proposedById_fkey"
  FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Project_proposedById_idx" ON "Project"("proposedById");

-- Satu keputusan per pihak penyetuju.
CREATE TABLE "ProjectApproval" (
  "id"          TEXT NOT NULL,
  "projectId"   TEXT NOT NULL,
  "role"        TEXT NOT NULL,
  "decision"    TEXT NOT NULL,
  "note"        TEXT,
  "decidedById" TEXT,
  "decidedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectApproval_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProjectApproval_projectId_role_key" ON "ProjectApproval"("projectId", "role");
CREATE INDEX "ProjectApproval_projectId_idx" ON "ProjectApproval"("projectId");
CREATE INDEX "ProjectApproval_decidedById_idx" ON "ProjectApproval"("decidedById");
ALTER TABLE "ProjectApproval" ADD CONSTRAINT "ProjectApproval_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectApproval" ADD CONSTRAINT "ProjectApproval_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Laporan kemajuan per proyek, per minggu atau per bulan.
CREATE TABLE "ProjectProgressReport" (
  "id"            TEXT NOT NULL,
  "projectId"     TEXT NOT NULL,
  "entityId"      TEXT NOT NULL,
  "cadence"       TEXT NOT NULL,
  "periodKey"     TEXT NOT NULL,
  "periodStart"   TIMESTAMP(3) NOT NULL,
  "periodEnd"     TIMESTAMP(3) NOT NULL,
  "status"        TEXT NOT NULL,
  "progressPct"   INTEGER NOT NULL DEFAULT 0,
  "summary"       TEXT NOT NULL,
  "obstacle"      TEXT,
  "followUp"      TEXT,
  "evidenceCount" INTEGER NOT NULL DEFAULT 0,
  "submittedById" TEXT,
  "submittedAt"   TIMESTAMP(3),
  "isLocked"      BOOLEAN NOT NULL DEFAULT false,
  "lockedAt"      TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectProgressReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProjectProgressReport_projectId_cadence_periodKey_key"
  ON "ProjectProgressReport"("projectId", "cadence", "periodKey");
CREATE INDEX "ProjectProgressReport_entityId_cadence_periodKey_idx"
  ON "ProjectProgressReport"("entityId", "cadence", "periodKey");
CREATE INDEX "ProjectProgressReport_submittedById_idx" ON "ProjectProgressReport"("submittedById");
ALTER TABLE "ProjectProgressReport" ADD CONSTRAINT "ProjectProgressReport_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectProgressReport" ADD CONSTRAINT "ProjectProgressReport_entityId_fkey"
  FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectProgressReport" ADD CONSTRAINT "ProjectProgressReport_submittedById_fkey"
  FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data API tetap tertutup: RLS aktif tanpa kebijakan, sama seperti tabel lain.
ALTER TABLE "ProjectApproval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectProgressReport" ENABLE ROW LEVEL SECURITY;
