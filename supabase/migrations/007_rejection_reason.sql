-- Add rejection_reason column to picks table for audit trail
ALTER TABLE picks ADD COLUMN IF NOT EXISTS rejection_reason text;
