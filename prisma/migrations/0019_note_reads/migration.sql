-- 0019 — [F1-D] tanda baca catatan proyek per akun & riwayat catatan revisi output (6 Okt 2026).
--
-- NoteRead menggantikan ProjectNote.readAt tunggal: dalam percakapan tiga pihak
-- (PIC, kepala divisi, Admin PT) setiap akun punya status belum dibaca sendiri.
-- ProjectNote.readAt dipertahankan sebagai penanda lama: catatan yang sudah
-- bertanda sebelum migrasi ini dianggap dibaca semua pihak; catatan baru tidak
-- lagi mengisinya.
--
-- OutputRevision menyimpan setiap catatan "Minta revisi", sehingga mengurungkan
-- permintaan revisi memulihkan catatan putaran sebelumnya, bukan mengosongkannya.

CREATE TABLE "NoteRead" (
  "id"     TEXT NOT NULL,
  "noteId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NoteRead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NoteRead_noteId_userId_key" ON "NoteRead"("noteId", "userId");
CREATE INDEX "NoteRead_userId_idx" ON "NoteRead"("userId");
ALTER TABLE "NoteRead" ADD CONSTRAINT "NoteRead_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "ProjectNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteRead" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "OutputRevision" (
  "id"         TEXT NOT NULL,
  "outputId"   TEXT NOT NULL,
  "note"       TEXT NOT NULL,
  "reviewerId" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "undoneAt"   TIMESTAMP(3),
  CONSTRAINT "OutputRevision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OutputRevision_outputId_createdAt_idx" ON "OutputRevision"("outputId", "createdAt");
ALTER TABLE "OutputRevision" ADD CONSTRAINT "OutputRevision_outputId_fkey"
  FOREIGN KEY ("outputId") REFERENCES "Output"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutputRevision" ENABLE ROW LEVEL SECURITY;

-- Isi riwayat dari catatan revisi yang sudah ada (satu baris per output).
INSERT INTO "OutputRevision" ("id", "outputId", "note", "reviewerId", "createdAt")
SELECT 'rev_' || "id", "id", "revisionNote", "reviewerId", COALESCE("reviewedAt", "updatedAt")
FROM "Output"
WHERE "revisionNote" IS NOT NULL;
