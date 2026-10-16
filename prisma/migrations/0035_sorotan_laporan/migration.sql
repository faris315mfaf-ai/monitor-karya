-- 0035 — sorotan supervisor pada laporan subholding (16 Okt 2026).
-- Additive: tiga kolom baru (bawaan false/NULL) + satu indeks; baris lama tetap
-- sah tanpa backfill. SQL dari `prisma migrate diff` skema 0034 → skema ini.

-- AlterTable
ALTER TABLE "SubholdingReport" ADD COLUMN     "highlight" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "highlightNote" TEXT,
ADD COLUMN     "highlightedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SubholdingReport_status_reportDate_highlight_idx" ON "SubholdingReport"("status", "reportDate", "highlight");
