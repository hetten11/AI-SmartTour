-- Đổi phiên sang cặp access token (ngắn hạn) + refresh token (dài hạn).
-- "expires_at" giữ nguyên nghĩa cũ là hạn của cookie access token.
-- Phiên đang có được coi như refresh token chính là access token cũ, để người
-- đang đăng nhập không bị đăng xuất sau khi deploy.

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "refresh_token_hash" VARCHAR(64);
ALTER TABLE "sessions" ADD COLUMN "refresh_expires_at" TIMESTAMPTZ(6);

UPDATE "sessions"
SET "refresh_token_hash" = "token_hash",
    "refresh_expires_at" = "expires_at"
WHERE "refresh_token_hash" IS NULL;

ALTER TABLE "sessions" ALTER COLUMN "refresh_token_hash" SET NOT NULL;
ALTER TABLE "sessions" ALTER COLUMN "refresh_expires_at" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_refresh_expires_at_idx" ON "sessions"("refresh_expires_at");
