-- 0034 — laporan harian per SUBHOLDING (model PT BIKE Tbk, 16 Okt 2026).
-- Additive: dua tabel baru; tidak mengubah tabel/kolom lama.

-- CreateTable
CREATE TABLE "SubholdingReport" (
    "id" TEXT NOT NULL,
    "subholdingId" TEXT NOT NULL,
    "ptId" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "kegiatan" TEXT NOT NULL,
    "deskripsi" TEXT NOT NULL,
    "reporterName" TEXT NOT NULL,
    "reporterTitleKind" TEXT NOT NULL,
    "reporterTitleField" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'MENUNGGU',
    "createdById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubholdingReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubholdingReportComment" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'KOMENTAR',
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubholdingReportComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubholdingReport_subholdingId_reportDate_idx" ON "SubholdingReport"("subholdingId", "reportDate");

-- CreateIndex
CREATE INDEX "SubholdingReport_status_reportDate_idx" ON "SubholdingReport"("status", "reportDate");

-- CreateIndex
CREATE INDEX "SubholdingReport_ptId_idx" ON "SubholdingReport"("ptId");

-- CreateIndex
CREATE INDEX "SubholdingReport_createdById_idx" ON "SubholdingReport"("createdById");

-- CreateIndex
CREATE INDEX "SubholdingReport_decidedById_idx" ON "SubholdingReport"("decidedById");

-- CreateIndex
CREATE INDEX "SubholdingReportComment_reportId_createdAt_idx" ON "SubholdingReportComment"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "SubholdingReportComment_authorId_idx" ON "SubholdingReportComment"("authorId");

-- AddForeignKey
ALTER TABLE "SubholdingReport" ADD CONSTRAINT "SubholdingReport_subholdingId_fkey" FOREIGN KEY ("subholdingId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubholdingReport" ADD CONSTRAINT "SubholdingReport_ptId_fkey" FOREIGN KEY ("ptId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubholdingReport" ADD CONSTRAINT "SubholdingReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubholdingReport" ADD CONSTRAINT "SubholdingReport_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubholdingReportComment" ADD CONSTRAINT "SubholdingReportComment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SubholdingReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubholdingReportComment" ADD CONSTRAINT "SubholdingReportComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

