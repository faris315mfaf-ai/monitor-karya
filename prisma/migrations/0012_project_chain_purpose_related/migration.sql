-- 0012 — pengajuan proyek berantai per pengaju, tujuan, dan PT terkait (11 Sep 2026).

ALTER TABLE "Project" ADD COLUMN "purpose" TEXT;
ALTER TABLE "Project" ADD COLUMN "approvalChain" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "ProjectEntity" (
  "projectId" TEXT NOT NULL,
  "entityId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectEntity_pkey" PRIMARY KEY ("projectId", "entityId")
);
CREATE INDEX "ProjectEntity_entityId_idx" ON "ProjectEntity"("entityId");
ALTER TABLE "ProjectEntity" ADD CONSTRAINT "ProjectEntity_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectEntity" ADD CONSTRAINT "ProjectEntity_entityId_fkey"
  FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectEntity" ENABLE ROW LEVEL SECURITY;
