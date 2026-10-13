-- 0033 — kunci idempotensi tulis klien (gelombang E, 13 Okt 2026).
-- Outbox Android mengulang POST bila proses mati tepat setelah server sukses;
-- header Idempotency-Key + tabel ini membuat ulangan dibalas respons pertama
-- tanpa duplikat entri/bukti. Additive/aman: tabel baru saja, tanpa perubahan
-- data atau kolom lama. Idempoten (IF NOT EXISTS) seperti 0032.

CREATE TABLE IF NOT EXISTS "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "resourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- Lingkup per pengguna: kunci sama dari pengguna lain tidak bentrok.
-- Juga penjaga balapan: dua permintaan bersamaan, hanya satu yang lolos INSERT.
CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyKey_userId_key_key" ON "IdempotencyKey" ("userId", "key");

-- Pembersihan > 7 hari oleh cron harian.
CREATE INDEX IF NOT EXISTS "IdempotencyKey_createdAt_idx" ON "IdempotencyKey" ("createdAt");
