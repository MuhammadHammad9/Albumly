-- Row Level Security: Postgres itself checks that each row belongs to the signed-in user.
-- auth.uid() is the user id from the request's token. Wrapping it in (select ...) makes Postgres
-- work it out once per query instead of once per row.
--
-- Our Express server runs every request as the `authenticated` role with that user's id, so these
-- rules apply to our own queries too. They also protect the tables from anyone calling Supabase's
-- Data API directly with the public key.

alter table public.profiles enable row level security;
alter table public.library_entries enable row level security;
alter table public.collections enable row level security;
alter table public.collection_albums enable row level security;

-- Signed-out visitors (`anon`) get nothing. Supabase grants new tables to them by default.
revoke all on public.profiles, public.library_entries, public.collections, public.collection_albums from anon;
grant select, insert, update, delete on public.profiles, public.library_entries, public.collections, public.collection_albums to authenticated;

-- profiles: the row whose id is yours
create policy "profiles: read own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: add own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles: change own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles: delete own" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

-- library_entries
create policy "entries: read own" on public.library_entries for select to authenticated using ((select auth.uid()) = user_id);
create policy "entries: add own" on public.library_entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "entries: change own" on public.library_entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "entries: delete own" on public.library_entries for delete to authenticated using ((select auth.uid()) = user_id);

-- collections
create policy "collections: read own" on public.collections for select to authenticated using ((select auth.uid()) = user_id);
create policy "collections: add own" on public.collections for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "collections: change own" on public.collections for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "collections: delete own" on public.collections for delete to authenticated using ((select auth.uid()) = user_id);

-- collection_albums
create policy "collection albums: read own" on public.collection_albums for select to authenticated using ((select auth.uid()) = user_id);
create policy "collection albums: add own" on public.collection_albums for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "collection albums: change own" on public.collection_albums for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "collection albums: delete own" on public.collection_albums for delete to authenticated using ((select auth.uid()) = user_id);
