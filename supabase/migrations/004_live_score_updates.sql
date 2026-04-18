-- Live score update tracking — prevents duplicate Telegram notifications
create table if not exists live_score_updates (
  id uuid primary key default gen_random_uuid(),
  pick_id uuid not null,
  home_score int not null default 0,
  away_score int not null default 0,
  game_state text not null default 'pre',
  period int not null default 0,
  status_text text not null default '',
  sent_at timestamptz not null default now()
);

create index if not exists idx_live_score_updates_pick on live_score_updates(pick_id);
