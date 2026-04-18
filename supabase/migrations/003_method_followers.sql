-- Method followers and pick tracking
create table if not exists method_followers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  unit_value numeric not null default 5,
  start_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists follower_picks (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references method_followers(id) on delete cascade,
  pick_id uuid not null,
  followed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (follower_id, pick_id)
);

create index if not exists idx_follower_picks_follower on follower_picks(follower_id);
create index if not exists idx_follower_picks_pick on follower_picks(pick_id);
