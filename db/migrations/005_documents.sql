CREATE TABLE IF NOT EXISTS "documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "doc_id" uuid NOT NULL,
  "title" text NOT NULL,
  "content_md" text NOT NULL,
  "content_hash" text NOT NULL,
  "file_size_bytes" integer NOT NULL,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "delete_expires_at" bigint,
  "created_at" bigint NOT NULL,
  UNIQUE ("user_id", "doc_id")
);

CREATE INDEX IF NOT EXISTS idx_documents_user ON documents ("user_id");
CREATE INDEX IF NOT EXISTS idx_documents_expiry ON documents ("delete_expires_at") WHERE "delete_expires_at" IS NOT NULL;
