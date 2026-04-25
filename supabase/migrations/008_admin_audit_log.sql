-- Admin audit log for tracking all dashboard mutations
CREATE TABLE admin_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  before_value jsonb,
  after_value jsonb,
  actor text NOT NULL DEFAULT 'dashboard'
);

CREATE INDEX idx_admin_audit_log_created ON admin_audit_log(created_at DESC);
CREATE INDEX idx_admin_audit_log_action ON admin_audit_log(action);

-- System config for runtime flag overrides (overrides env vars without redeploy)
CREATE TABLE system_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT 'dashboard'
);

-- Seed with current defaults
INSERT INTO system_config (key, value) VALUES
  ('TIPSTER_ENABLED', 'false'),
  ('PINNACLE_CROSSCHECK_ENABLED', 'true'),
  ('ADMIN_TELEGRAM_ID', '7238245588'),
  ('TELEGRAM_ADMIN_CHAT_ID', '7238245588')
ON CONFLICT (key) DO NOTHING;
