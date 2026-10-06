-- 0025 — [F2-URUNGKAN] tiket urungkan untuk tindakan yang bisa dibalik (6 Okt 2026).
--
-- Satu baris per tindakan yang bisa diurungkan: keputusan pengajuan proyek,
-- tinjau/putuskan/tutup eskalasi, ajukan ulang & arsip proyek, dan penerusan
-- laporan harian/mingguan di Penerimaan. Berlaku 15 menit (expiresAt), hanya
-- untuk pelaku yang sama (actorId), sekali pakai (usedAt). "snapshot" memuat
-- keadaan persis sebelum tindakan (JSON) dan "stamp" sidik keadaan sesudahnya;
-- urungkan ditolak bila keadaan sudah diubah orang lain. Tanpa FK ke "User"
-- (akun dijaga di API), sama seperti "NoteRead".

CREATE TABLE "UndoToken" (
  "id"         TEXT NOT NULL,
  "action"     TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId"   TEXT NOT NULL,
  "entityId"   TEXT,
  "actorId"    TEXT NOT NULL,
  "snapshot"   TEXT NOT NULL,
  "stamp"      TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "usedAt"     TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UndoToken_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UndoToken_actorId_createdAt_idx" ON "UndoToken"("actorId", "createdAt");
CREATE INDEX "UndoToken_targetType_targetId_idx" ON "UndoToken"("targetType", "targetId");
ALTER TABLE "UndoToken" ENABLE ROW LEVEL SECURITY;
