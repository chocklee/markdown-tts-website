-- 一键完整转换音频（每篇文档一份，重新转换覆盖）
CREATE TABLE IF NOT EXISTS converted_audios (
  user_id text NOT NULL,
  doc_id text NOT NULL,
  voice text NOT NULL,
  rate numeric NOT NULL,
  skip_code boolean NOT NULL,
  skip_table boolean NOT NULL,
  chars integer NOT NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',  -- pending | converting | done | failed
  progress real NOT NULL DEFAULT 0,
  chunks_total integer NOT NULL DEFAULT 0,
  chunks_done integer NOT NULL DEFAULT 0,
  audio bytea,
  content_type text NOT NULL DEFAULT 'audio/mpeg',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, doc_id)
);

CREATE INDEX IF NOT EXISTS idx_converted_audios_user ON converted_audios (user_id);

-- 退款幂等：同一 user+ref 的退款只入账一次（并发失败路径避免双倍退款）
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_tx_adjustment ON credit_transactions (user_id, ref) WHERE kind = 'adjustment';
