-- 0011 — akun dengan username & jabatan, identitas & logo perusahaan (10 Sep 2026).

ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "title" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

ALTER TABLE "Entity" ADD COLUMN "logoData" TEXT;
ALTER TABLE "Entity" ADD COLUMN "address" TEXT;
ALTER TABLE "Entity" ADD COLUMN "phone" TEXT;
ALTER TABLE "Entity" ADD COLUMN "email" TEXT;
ALTER TABLE "Entity" ADD COLUMN "website" TEXT;
