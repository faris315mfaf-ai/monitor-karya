-- 0014 — fitur PIC proyek: catatan kepala divisi, tahapan bertanggal, usulan geser tenggat (6 Okt 2026).

CREATE TABLE "ProjectNote" (
  "id"        TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "authorId"  TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt"    TIMESTAMP(3),
  CONSTRAINT "ProjectNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectNote_projectId_createdAt_idx" ON "ProjectNote"("projectId", "createdAt");
CREATE INDEX "ProjectNote_authorId_idx" ON "ProjectNote"("authorId");
ALTER TABLE "ProjectNote" ADD CONSTRAINT "ProjectNote_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectNote" ADD CONSTRAINT "ProjectNote_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectNote" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "ProjectStage" (
  "id"        TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "position"  INTEGER NOT NULL DEFAULT 0,
  "startDate" TIMESTAMP(3),
  "dueDate"   TIMESTAMP(3),
  "status"    TEXT NOT NULL DEFAULT 'BELUM_MULAI',
  "note"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectStage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectStage_projectId_position_idx" ON "ProjectStage"("projectId", "position");
ALTER TABLE "ProjectStage" ADD CONSTRAINT "ProjectStage_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectStage" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "DeadlineProposal" (
  "id"           TEXT NOT NULL,
  "projectId"    TEXT NOT NULL,
  "previousDate" TIMESTAMP(3),
  "proposedDate" TIMESTAMP(3) NOT NULL,
  "reason"       TEXT NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'DIAJUKAN',
  "proposedById" TEXT NOT NULL,
  "decidedById"  TEXT,
  "decidedAt"    TIMESTAMP(3),
  "decisionNote" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeadlineProposal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeadlineProposal_projectId_status_idx" ON "DeadlineProposal"("projectId", "status");
CREATE INDEX "DeadlineProposal_proposedById_idx" ON "DeadlineProposal"("proposedById");
ALTER TABLE "DeadlineProposal" ADD CONSTRAINT "DeadlineProposal_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeadlineProposal" ADD CONSTRAINT "DeadlineProposal_proposedById_fkey"
  FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeadlineProposal" ADD CONSTRAINT "DeadlineProposal_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeadlineProposal" ENABLE ROW LEVEL SECURITY;
