create table if not exists public.rooms (
  id text primary key,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.distributors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.movies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  director text,
  poster_url text,
  distributor_id uuid references public.distributors(id) on delete set null,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.movies
add column if not exists distributor_id uuid references public.distributors(id) on delete set null;

alter table public.movies
add column if not exists director text;

create index if not exists movies_distributor_id_idx
  on public.movies (distributor_id);

create type public.weekday_key as enum (
  'friday',
  'saturday',
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday'
);

create table if not exists public.screenings (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  day public.weekday_key not null,
  room_id text not null references public.rooms(id) on delete cascade,
  movie_id uuid references public.movies(id) on delete set null,
  starts_at time not null,
  session_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists screenings_week_day_room_idx
  on public.screenings (week_start, day, room_id, starts_at);

create table if not exists public.weekly_movies (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  movie_id uuid not null references public.movies(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (week_start, movie_id)
);

create index if not exists weekly_movies_week_start_idx
  on public.weekly_movies (week_start);

create index if not exists weekly_movies_movie_id_idx
  on public.weekly_movies (movie_id);

insert into public.rooms (id, name, position)
values
  ('room-1', 'Sala 1', 1),
  ('room-2', 'Sala 2', 2),
  ('room-3', 'Sala 3', 3),
  ('room-4', 'Sala 4', 4),
  ('room-5', 'Sala 5', 5)
on conflict (id) do update
set name = excluded.name,
    position = excluded.position;
