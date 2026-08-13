-- 云端 TTS 音频缓存
CREATE TABLE IF NOT EXISTS tts_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  voice text NOT NULL,
  text_hash text NOT NULL,
  audio bytea NOT NULL,
  content_type text NOT NULL,
  chars integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tts_cache ON tts_cache (provider, voice, text_hash);
CREATE INDEX IF NOT EXISTS idx_tts_cache_created ON tts_cache (created_at);
