alter table public.rooms enable row level security;
alter table public.movies enable row level security;
alter table public.screenings enable row level security;
alter table public.distributors enable row level security;

revoke all on table public.rooms from anon;
revoke all on table public.movies from anon;
revoke all on table public.screenings from anon;
revoke all on table public.distributors from anon;

grant usage on schema public to authenticated;
grant usage on type public.weekday_key to authenticated;

grant select, insert, update, delete on table public.rooms to authenticated;
grant select, insert, update, delete on table public.movies to authenticated;
grant select, insert, update, delete on table public.screenings to authenticated;
grant select, insert, update, delete on table public.distributors to authenticated;

drop policy if exists "authenticated full access rooms" on public.rooms;
drop policy if exists "authenticated full access movies" on public.movies;
drop policy if exists "authenticated full access screenings" on public.screenings;
drop policy if exists "authenticated full access distributors" on public.distributors;

create policy "authenticated full access rooms"
on public.rooms
for all
to authenticated
using (true)
with check (true);

create policy "authenticated full access movies"
on public.movies
for all
to authenticated
using (true)
with check (true);

create policy "authenticated full access screenings"
on public.screenings
for all
to authenticated
using (true)
with check (true);

create policy "authenticated full access distributors"
on public.distributors
for all
to authenticated
using (true)
with check (true);
