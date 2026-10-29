-- Thêm phiên chat: gom tin nhắn cũ vào một phiên cho mỗi cặp (user, chuyến đi),
-- rồi bỏ cột trip_id trên chat_messages vì đã có trip_id trên phiên.

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "trip_id" UUID,
    "title" VARCHAR(150),
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_last_message_at_idx" ON "chat_sessions"("user_id", "last_message_at");

-- CreateIndex
CREATE INDEX "chat_sessions_trip_id_idx" ON "chat_sessions"("trip_id");

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN "session_id" UUID;

-- Backfill: một phiên cho mỗi cặp (user_id, trip_id), tiêu đề lấy từ tin nhắn đầu.
INSERT INTO "chat_sessions" ("id", "user_id", "trip_id", "title", "created_at", "last_message_at")
SELECT
    gen_random_uuid(),
    "user_id",
    "trip_id",
    left(first_message, 150),
    first_at,
    last_at
FROM (
    SELECT
        "user_id",
        "trip_id",
        (array_agg("content" ORDER BY "created_at"))[1] AS first_message,
        min("created_at") AS first_at,
        max("created_at") AS last_at
    FROM "chat_messages"
    GROUP BY "user_id", "trip_id"
) AS grouped;

UPDATE "chat_messages" AS message
SET "session_id" = session."id"
FROM "chat_sessions" AS session
WHERE session."user_id" = message."user_id"
  AND session."trip_id" IS NOT DISTINCT FROM message."trip_id";

-- AlterTable
ALTER TABLE "chat_messages" ALTER COLUMN "session_id" SET NOT NULL;

-- DropIndex
DROP INDEX "chat_messages_user_id_trip_id_created_at_idx";

-- AlterTable
ALTER TABLE "chat_messages" DROP COLUMN "trip_id";

-- CreateIndex
CREATE INDEX "chat_messages_session_id_created_at_idx" ON "chat_messages"("session_id", "created_at");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "itineraries" ADD COLUMN "chat_session_id" UUID;

-- CreateIndex
CREATE INDEX "itineraries_chat_session_id_idx" ON "itineraries"("chat_session_id");

-- AddForeignKey
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "chat_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
