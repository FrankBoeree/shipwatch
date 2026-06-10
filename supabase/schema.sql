create extension if not exists postgis;
create extension if not exists pgcrypto;

create table if not exists public_ships (
  id uuid primary key default gen_random_uuid(),
  mmsi text unique,
  imo text,
  name text,
  ship_type text not null default 'unknown',
  length_m numeric,
  width_m numeric,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  passage_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public_passages (
  id uuid primary key default gen_random_uuid(),
  ship_id uuid references public_ships(id),
  occurred_at timestamptz not null,
  direction text not null default 'unknown',
  detection_confidence numeric not null,
  detected_type text not null default 'unknown',
  identification_status text not null default 'unknown',
  photo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public_stats_daily (
  date date primary key,
  passage_count integer not null default 0
);

create table if not exists public_stats_hourly (
  hour text primary key,
  passage_count integer not null default 0
);

create table if not exists public_stats_by_type (
  ship_type text primary key,
  passage_count integer not null default 0
);

create table if not exists public_runtime_status (
  id text primary key,
  latest_snapshot_url text,
  latest_snapshot_updated_at timestamptz,
  last_sync_at timestamptz
);

insert into public_runtime_status (id) values ('public') on conflict (id) do nothing;

alter table public_ships enable row level security;
alter table public_passages enable row level security;
alter table public_stats_daily enable row level security;
alter table public_stats_hourly enable row level security;
alter table public_stats_by_type enable row level security;
alter table public_runtime_status enable row level security;

create policy "public read ships" on public_ships for select using (true);
create policy "public read passages" on public_passages for select using (true);
create policy "public read daily stats" on public_stats_daily for select using (true);
create policy "public read hourly stats" on public_stats_hourly for select using (true);
create policy "public read type stats" on public_stats_by_type for select using (true);
create policy "public read runtime status" on public_runtime_status for select using (true);

grant usage on schema public to anon, authenticated;
grant select on public_ships, public_passages, public_stats_daily, public_stats_hourly, public_stats_by_type, public_runtime_status to anon, authenticated;

insert into storage.buckets (id, name, public)
values
  ('passage-photos', 'passage-photos', true),
  ('live-snapshots', 'live-snapshots', true)
on conflict (id) do nothing;

create policy "public read passage photos" on storage.objects
for select using (bucket_id = 'passage-photos');

create policy "public read live snapshots" on storage.objects
for select using (bucket_id = 'live-snapshots');
