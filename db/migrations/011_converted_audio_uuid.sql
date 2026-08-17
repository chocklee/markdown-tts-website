-- converted_audios 与 documents/users 对齐：user_id/doc_id 改为 uuid
-- （修复惰性回收站清理子查询中 uuid = text 无法比较导致的同步失败）
ALTER TABLE converted_audios
  ALTER COLUMN user_id TYPE uuid USING user_id::uuid,
  ALTER COLUMN doc_id TYPE uuid USING doc_id::uuid;
