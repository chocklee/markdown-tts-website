-- 修正与 @auth/pg-adapter v1.x 表名/约束的差异
ALTER TABLE IF EXISTS "account" RENAME TO "accounts";
ALTER TABLE IF EXISTS "session" RENAME TO "sessions";
ALTER TABLE IF EXISTS "verificationToken" RENAME TO "verification_token";

ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON "users" (lower(email));
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON "accounts" ("userId");
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON "sessions" ("userId");
