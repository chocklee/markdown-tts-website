-- 缓存键加入语速：同文本不同 rate 不共享缓存
ALTER TABLE tts_cache ADD COLUMN IF NOT EXISTS rate double precision NOT NULL DEFAULT 1;

DROP INDEX IF EXISTS uq_tts_cache;
CREATE UNIQUE INDEX uq_tts_cache ON tts_cache (provider, voice, text_hash, rate);
