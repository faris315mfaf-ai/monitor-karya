CREATE TABLE "AccountActivation" (
  "userId" TEXT NOT NULL PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "tokenHash" TEXT NOT NULL,
  "credentialDigest" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AccountActivation_tokenHash_key" ON "AccountActivation"("tokenHash");
CREATE INDEX "AccountActivation_expiresAt_idx" ON "AccountActivation"("expiresAt");
ALTER TABLE "AccountActivation" ENABLE ROW LEVEL SECURITY;
