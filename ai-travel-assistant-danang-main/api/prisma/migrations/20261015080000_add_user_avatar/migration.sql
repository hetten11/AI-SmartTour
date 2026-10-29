ALTER TABLE "users" ADD COLUMN "avatar_url" TEXT;

UPDATE "users"
SET "avatar_url" = 'https://api.dicebear.com/9.x/avataaars/svg?seed='
    || encode(convert_to(lower("email"), 'UTF8'), 'hex');

ALTER TABLE "users" ALTER COLUMN "avatar_url" SET NOT NULL;
