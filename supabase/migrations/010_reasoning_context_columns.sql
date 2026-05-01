-- Track the original line/odds/bookmaker that reasoning was written for.
-- Set by the edit API when these fields are changed after pick creation.
ALTER TABLE picks ADD COLUMN IF NOT EXISTS reasoning_bookmaker text;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS reasoning_line text;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS reasoning_odds numeric;
