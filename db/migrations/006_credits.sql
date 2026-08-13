-- 积分账户 + 流水
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_balance bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount bigint NOT NULL,
  kind text NOT NULL CHECK (kind IN ('purchase','bonus','consumption','refund','adjustment')),
  ref text,
  description text NOT NULL,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions (user_id, created_at DESC);

-- 购买入账幂等：同一用户同一 Stripe session 只入账一次
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_tx_purchase ON credit_transactions (user_id, ref) WHERE kind = 'purchase';

-- 免费配额 50MB → 100MB（已有用户只升不降）
UPDATE users SET storage_quota_bytes = 104857600
WHERE storage_quota_bytes < 104857600;

ALTER TABLE users ALTER COLUMN storage_quota_bytes SET DEFAULT 104857600;
