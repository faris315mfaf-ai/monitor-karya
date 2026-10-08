-- 0018 — keamanan akun (F1-C, 6 Okt 2026): kolom wajib-ganti-kata-sandi.
-- Akun yang dibuat atau disetel ulang kata sandinya oleh admin diberi true;
-- pemiliknya dipaksa ke layar ganti kata sandi sebelum bisa memakai aplikasi.
-- Ditulis tangan; jalankan lewat prisma migrate deploy.
--
-- Tabel "User" sudah ENABLE ROW LEVEL SECURITY sejak 0002_enable_rls; kolom
-- baru ikut aturan tabelnya, tidak perlu kebijakan tambahan.

ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
