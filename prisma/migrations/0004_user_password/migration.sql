-- Credentials login: store a scrypt password hash per user.
-- Nullable so existing rows stay valid; an account with NULL cannot sign in.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
