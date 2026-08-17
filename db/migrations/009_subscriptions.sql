-- 积分包月订阅：用户表增加订阅字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'none';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_period_end timestamptz;

-- 流水类型扩展：包月发放 / 到期清零
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_kind_check;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_kind_check
  CHECK (kind IN ('purchase','bonus','consumption','refund','adjustment','subscription_grant','subscription_reset'));

CREATE INDEX IF NOT EXISTS idx_users_active_subscription
  ON users (subscription_status) WHERE subscription_status = 'active';
