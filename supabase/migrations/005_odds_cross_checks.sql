-- Phase 3: Odds cross-check audit table (Pinnacle vs cited book)
create table if not exists odds_cross_checks (
  id bigserial primary key,
  created_at timestamptz default now(),
  game_id text,
  sport text,
  market text,
  side text,
  cited_book text,
  cited_line numeric,
  cited_price integer,
  pinnacle_line numeric,
  pinnacle_price integer,
  divergence numeric,
  result text not null check (result in ('pass', 'veto', 'scraper_failed')),
  raw_pinnacle_payload jsonb
);
create index odds_cross_checks_created_idx on odds_cross_checks(created_at desc);
create index odds_cross_checks_result_idx on odds_cross_checks(result);
