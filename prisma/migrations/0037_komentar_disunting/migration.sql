-- 0037 — komentar laporan subholding bisa disunting penulisnya (29 Okt 2026).
-- Additive: satu kolom NULL; baris lama tetap sah tanpa backfill.

-- AlterTable
ALTER TABLE "SubholdingReportComment" ADD COLUMN     "editedAt" TIMESTAMP(3);
