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

create table if not exists passage_photos (
  id uuid primary key default gen_random_uuid(),
  passage_id uuid not null references public_passages(id) on delete cascade,
  file_path text not null,
  captured_at timestamptz not null,
  detection_confidence numeric not null,
  bbox jsonb not null,
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
