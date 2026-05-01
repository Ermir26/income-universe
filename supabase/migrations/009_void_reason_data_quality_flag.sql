-- Pre-launch data hygiene: add columns for audit trail
ALTER TABLE picks ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS data_quality_flag text;
