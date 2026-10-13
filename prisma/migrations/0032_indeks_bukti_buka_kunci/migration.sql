-- 0032 — indeks kueri per target + bersih-bersih indeks ganda (T11-DB, 12 Okt 2026).
-- Additive/aman: hanya CREATE/DROP INDEX, tanpa perubahan data atau kolom.
-- Nama indeks mengikuti konvensi baku Prisma (cocok dengan @@index tanpa map:).

-- Evidence dihitung/dimuat per (targetType, targetId) di setiap perubahan task,
-- tampilan laporan, dan serah mingguan; sebelumnya full scan.
CREATE INDEX IF NOT EXISTS "Evidence_targetType_targetId_idx" ON "Evidence" ("targetType", "targetId");

-- dailyGate/daily-input/weekly-input/work-desk mencari permintaan buka kunci per target.
CREATE INDEX IF NOT EXISTS "UnlockRequest_targetType_targetId_idx" ON "UnlockRequest" ("targetType", "targetId");

-- ReportSettings_entityId_key (UNIQUE) sudah melayani pencarian entityId;
-- indeks biasa dari 0030 redundan dan hanya menambah biaya tulis.
DROP INDEX IF EXISTS "ReportSettings_entityId_idx";
