-- Add settlement scheduling columns to picks table
ALTER TABLE picks
  ADD COLUMN IF NOT EXISTS estimated_end_time timestamptz,
  ADD COLUMN IF NOT EXISTS settlement_check_time timestamptz,
  ADD COLUMN IF NOT EXISTS settle_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS league_slug text,
  ADD COLUMN IF NOT EXISTS actual_home_score int,
  ADD COLUMN IF NOT EXISTS actual_away_score int,
  ADD COLUMN IF NOT EXISTS bet_type text,
  ADD COLUMN IF NOT EXISTS line numeric,
  ADD COLUMN IF NOT EXISTS side text;

-- Index for the settlement cron query
CREATE INDEX IF NOT EXISTS idx_picks_settlement_pending
  ON picks (settlement_check_time)
  WHERE status = 'pending' AND settlement_check_time IS NOT NULL;

-- Backfill existing pending picks with estimated end times
-- Soccer leagues: kickoff + 115 min, check at +120 min
UPDATE picks SET
  estimated_end_time = game_time + interval '115 minutes',
  settlement_check_time = game_time + interval '120 minutes'
WHERE status = 'pending'
  AND game_time IS NOT NULL
  AND settlement_check_time IS NULL
  AND sport_key IN (
    'soccer_epl', 'soccer_spain_la_liga', 'soccer_italy_serie_a',
    'soccer_germany_bundesliga', 'soccer_france_ligue_one',
    'soccer_uefa_champs_league', 'soccer_usa_mls'
  );

-- NBA/Basketball: kickoff + 140 min, check at +145 min
UPDATE picks SET
  estimated_end_time = game_time + interval '140 minutes',
  settlement_check_time = game_time + interval '145 minutes'
WHERE status = 'pending'
  AND game_time IS NOT NULL
  AND settlement_check_time IS NULL
  AND sport_key IN ('basketball_nba', 'basketball_euroleague');

-- NHL: kickoff + 150 min, check at +155 min
UPDATE picks SET
  estimated_end_time = game_time + interval '150 minutes',
  settlement_check_time = game_time + interval '155 minutes'
WHERE status = 'pending'
  AND game_time IS NOT NULL
  AND settlement_check_time IS NULL
  AND sport_key IN ('icehockey_nhl');

-- MLB: kickoff + 195 min, check at +200 min
UPDATE picks SET
  estimated_end_time = game_time + interval '195 minutes',
  settlement_check_time = game_time + interval '200 minutes'
WHERE status = 'pending'
  AND game_time IS NOT NULL
  AND settlement_check_time IS NULL
  AND sport_key IN ('baseball_mlb');

-- NFL/MMA/other: kickoff + 180 min, check at +185 min
UPDATE picks SET
  estimated_end_time = game_time + interval '180 minutes',
  settlement_check_time = game_time + interval '185 minutes'
WHERE status = 'pending'
  AND game_time IS NOT NULL
  AND settlement_check_time IS NULL;
