-- Phase 4: Pick decision log — every generation attempt with full context
create table if not exists pick_decision_log (
  id bigserial primary key,
  created_at timestamptz default now(),
  game_id text,
  sport text,
  game text,
  pick text,
  odds text,
  bookmaker text,
  confidence integer,
  claude_output jsonb,
  odds_api_payload jsonb,
  validator_result text,
  validator_correction text,
  cross_check_result text,
  final_decision text not null check (final_decision in (
    'published', 'rejected_validator', 'rejected_pinnacle',
    'rejected_time_guard', 'rejected_other'
  )),
  rejection_reason text,
  pick_id text
);
create index pick_decision_log_created_idx on pick_decision_log(created_at desc);
create index pick_decision_log_decision_idx on pick_decision_log(final_decision);
