-- 0036 — thumbnail bukti gambar (Fase 1 PWA, 16 Okt 2026).
-- Additive: satu kolom NULL-able; bukti lama tetap sah tanpa backfill (klien
-- yang meminta size thumb jatuh ke storageKey). SQL dari `prisma migrate diff`
-- skema 0035 → skema ini.

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "thumbKey" TEXT;
