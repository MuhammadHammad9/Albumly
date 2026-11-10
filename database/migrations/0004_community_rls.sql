-- Phase 7 grants and Row Level Security. Same idea as 0002: Postgres itself checks every row.
-- Grants say WHICH columns a role may touch; policies say WHICH rows.

alter table public.app_admins enable row level security;
alter table public.collection_shares enable row level security;
alter table public.review_hides enable row level security;
alter table public.battles enable row level security;
alter table public.battle_votes enable row level security;
alter table public.reports enable row level security;

-- Start from nothing (Supabase grants new tables to everyone by default)
revoke all on public.app_admins, public.collection_shares, public.review_hides, public.battles, public.battle_votes, public.reports
  from anon, authenticated;

-- app_admins and review_hides: no direct access at all. Only the functions in 0003 use them.

-- ---------- collection_shares: owners only ----------
-- Owners may read their share (including whether it was hidden) and turn it on or off.
-- They may not change the hidden_* columns (no column grant), nor delete the row (so a hidden
-- share cannot be swapped for a fresh link). Shares go away with their collection.
grant select, insert on public.collection_shares to authenticated;
grant update (visibility, include_reviews, updated_at) on public.collection_shares to authenticated;

create policy "shares: read own" on public.collection_shares for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "shares: add own" on public.collection_shares for insert to authenticated
  with check ((select auth.uid()) = user_id and hidden_at is null and hidden_by is null and hidden_reason is null);
create policy "shares: change own" on public.collection_shares for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------- battles: everyone reads visible ones; signed-in users add ----------
-- created_by is not readable: who made a battle is not public.
grant select (id, album_a_id, album_b_id, album_a, album_b, created_at, hidden_at) on public.battles to anon, authenticated;
grant insert (album_a_id, album_b_id, album_a, album_b) on public.battles to authenticated;

create policy "battles: read visible" on public.battles for select to anon, authenticated
  using (hidden_at is null);
create policy "battles: add own" on public.battles for insert to authenticated
  with check ((select auth.uid()) = created_by and hidden_at is null);

-- ---------- battle_votes: your own votes only; no changing or deleting ----------
grant select on public.battle_votes to authenticated;
grant insert (battle_id, choice) on public.battle_votes to authenticated;

create policy "votes: read own" on public.battle_votes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "votes: add own on visible battles" on public.battle_votes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.battles b where b.id = battle_id and b.hidden_at is null)
  );

-- ---------- reports: add your own, see your own ----------
grant select on public.reports to authenticated;
grant insert (target_type, share_id, album_id, battle_id, reason, details) on public.reports to authenticated;

create policy "reports: read own" on public.reports for select to authenticated
  using ((select auth.uid()) = reporter_id);
create policy "reports: add own" on public.reports for insert to authenticated
  with check ((select auth.uid()) = reporter_id and resolved_at is null);

-- ---------- functions ----------
-- New functions can be run by everyone by default; take that back, then grant what is needed.
revoke execute on function
  public.is_admin(), public.get_public_collection(text), public.reportable_share(text, text),
  public.battle_tallies(uuid[]), public.album_leaderboard(integer, integer), public.require_admin(),
  public.admin_set_hidden(text, uuid, text, uuid, boolean, text), public.admin_resolve_report(uuid, text, text),
  public.admin_list_reports(boolean), public.admin_share_id(text)
  from public, anon, authenticated;

grant execute on function public.get_public_collection(text), public.battle_tallies(uuid[]), public.album_leaderboard(integer, integer)
  to anon, authenticated;
grant execute on function
  public.is_admin(), public.reportable_share(text, text), public.require_admin(),
  public.admin_set_hidden(text, uuid, text, uuid, boolean, text), public.admin_resolve_report(uuid, text, text),
  public.admin_list_reports(boolean), public.admin_share_id(text)
  to authenticated;
