-- Auth hardening: session revocation + token-to-user binding
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_at" timestamptz;
ALTER TABLE "email_verifications" ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "password_resets" ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "idx_email_verifications_user_id" ON "email_verifications" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_password_resets_user_id" ON "password_resets" ("user_id");
