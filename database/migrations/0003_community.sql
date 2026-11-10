-- Phase 7: community and ops. Shared collections, Album Battle, reports and admins.
-- Grants and RLS policies are in 0004_community_rls.sql. Phase 5's tables are not changed:
-- everything new lives in new tables that point at them.

-- ---------- admins ----------

-- Who may moderate and see the ops dashboard. Granted by hand in the Supabase SQL editor:
--   insert into public.app_admins (user_id) select id from auth.users where email = 'you@example.com';
create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  note text not null default '' check (char_length(note) <= 200)
);

-- ---------- shared collections ----------

-- One row per collection that was ever shared. The slug is the readable part of the link
-- (/shared/road-trip-k3x9q2mw); it is made once and kept, so old links keep working.
create table public.collection_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  collection_id text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  include_reviews boolean not null default false,
  -- Set by moderators only (owners have no right to change these columns, see 0004)
  hidden_at timestamptz,
  hidden_by uuid references auth.users (id) on delete set null,
  hidden_reason text check (char_length(hidden_reason) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, collection_id),
  foreign key (user_id, collection_id) references public.collections (user_id, id) on delete cascade
);

-- A moderator hid this user's review of this album from shared pages. Linked to the account,
-- not to the library row, so removing and re-adding the album does not undo the hide.
create table public.review_hides (
  user_id uuid not null references auth.users (id) on delete cascade,
  album_id text not null check (album_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  hidden_by uuid references auth.users (id) on delete set null,
  reason text check (char_length(reason) <= 200),
  hidden_at timestamptz not null default now(),
  primary key (user_id, album_id)
);

-- ---------- Album Battle ----------

-- Two albums, stored in a fixed order (a < b), so each match-up exists only once.
-- The snapshots are copied from the creator's library when the battle is made.
create table public.battles (
  id uuid primary key default gen_random_uuid(),
  album_a_id text not null check (album_a_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  album_b_id text not null check (album_b_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  album_a jsonb not null check (jsonb_typeof(album_a) = 'object' and album_a ->> 'id' = album_a_id and pg_column_size(album_a) <= 20000),
  album_b jsonb not null check (jsonb_typeof(album_b) = 'object' and album_b ->> 'id' = album_b_id and pg_column_size(album_b) <= 20000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_by uuid references auth.users (id) on delete set null,
  hidden_reason text check (char_length(hidden_reason) <= 200),
  -- "C" collation: plain byte order, the same order JavaScript's < uses for these ids
  check (album_a_id collate "C" < album_b_id collate "C"),
  unique (album_a_id, album_b_id)
);

create index battles_recent_idx on public.battles (created_at desc) where hidden_at is null;

-- The primary key IS the rule "one vote per user per battle": Postgres refuses a second row.
create table public.battle_votes (
  battle_id uuid not null references public.battles (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  choice text not null check (choice in ('a', 'b')),
  created_at timestamptz not null default now(),
  primary key (battle_id, user_id)
);

-- Counting votes per battle and side reads only this index
create index battle_votes_choice_idx on public.battle_votes (battle_id, choice);

-- ---------- reports ----------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('collection', 'review', 'battle')),
  share_id uuid references public.collection_shares (id) on delete cascade,
  album_id text check (album_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  battle_id uuid references public.battles (id) on delete cascade,
  reason text not null check (reason in ('spam', 'offensive', 'personal_info', 'copyright', 'other')),
  details text not null default '' check (char_length(details) <= 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  resolution text check (resolution in ('hidden', 'dismissed')),
  -- Each kind of report points at exactly the right thing
  check (
    (target_type = 'collection' and share_id is not null and album_id is null and battle_id is null)
    or (target_type = 'review' and share_id is not null and album_id is not null and battle_id is null)
    or (target_type = 'battle' and battle_id is not null and share_id is null and album_id is null)
  ),
  check ((resolved_at is null) = (resolution is null))
);

-- One report per person per thing (coalesce: so the empty columns count as equal)
create unique index reports_one_per_person on public.reports (
  reporter_id, target_type, coalesce(share_id::text, ''), coalesce(album_id, ''), coalesce(battle_id::text, '')
);
create index reports_open_idx on public.reports (created_at) where resolved_at is null;

-- ---------- functions ----------
-- `security definer` functions run with their owner's rights, so they can read rows the caller
-- cannot. Each one returns a fixed, safe shape. `set search_path = ''` plus full names stop a
-- caller from slipping in a look-alike table.

create function public.is_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid())
$$;

-- Win rate we can be 95 % sure of (Wilson score lower bound). Same formula as ranking.js.
create function public.wilson_lower_bound(wins numeric, total numeric) returns double precision
language sql
immutable
set search_path = ''
as $$
  select case when total <= 0 then 0::double precision else greatest(0, (
    (wins / total) + 1.9208 / total
    - 1.96 * sqrt(((wins / total) * (1 - wins / total) + 0.9604 / total) / total)
  ) / (1 + 3.8416 / total))::double precision end
$$;

-- A shared collection as strangers may see it, or null when it is missing, private or hidden.
-- Album snapshots are cut down to display fields. Rating and review only when the owner chose
-- to show them and no moderator hid the review. Never: notes, tags, status, the owner's id.
create function public.get_public_collection(p_slug text) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', s.slug,
    'name', c.name,
    'description', c.description,
    'updatedAt', greatest(c.updated_at, s.updated_at),
    'includeReviews', s.include_reviews,
    'albums', coalesce((
      select jsonb_agg(jsonb_build_object(
          'album', jsonb_build_object(
            'id', e.album -> 'id', 'name', e.album -> 'name', 'artists', e.album -> 'artists',
            'albumType', e.album -> 'albumType', 'releaseDate', e.album -> 'releaseDate', 'year', e.album -> 'year',
            'totalTracks', e.album -> 'totalTracks', 'coverUrl', e.album -> 'coverUrl', 'spotifyUrl', e.album -> 'spotifyUrl'
          ),
          'rating', case when s.include_reviews and h.user_id is null then e.rating end,
          'review', case when s.include_reviews and h.user_id is null then nullif(e.review, '') end
        ) order by ca.position, ca.album_id)
      from public.collection_albums ca
      join public.library_entries e on e.user_id = ca.user_id and e.album_id = ca.album_id
      left join public.review_hides h on h.user_id = e.user_id and h.album_id = e.album_id
      where ca.user_id = s.user_id and ca.collection_id = s.collection_id
    ), '[]'::jsonb)
  )
  from public.collection_shares s
  join public.collections c on c.user_id = s.user_id and c.id = s.collection_id
  where s.slug = p_slug and s.visibility = 'public' and s.hidden_at is null
$$;

-- The share id behind a public link, for reports. With an album id: only when that album's
-- review is actually shown on the page (so hidden or private text cannot be "reported" to probe it).
create function public.reportable_share(p_slug text, p_album_id text) returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.collection_shares s
  where s.slug = p_slug and s.visibility = 'public' and s.hidden_at is null
    and (p_album_id is null or (s.include_reviews and exists (
      select 1
      from public.collection_albums ca
      join public.library_entries e on e.user_id = ca.user_id and e.album_id = ca.album_id
      where ca.user_id = s.user_id and ca.collection_id = s.collection_id and ca.album_id = p_album_id
        and e.review <> ''
        and not exists (select 1 from public.review_hides h where h.user_id = e.user_id and h.album_id = e.album_id)
    )))
$$;

-- Vote totals for visible battles. Who voted for what stays private.
create function public.battle_tallies(p_ids uuid[]) returns table (battle_id uuid, votes_a integer, votes_b integer)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id,
         (count(v.user_id) filter (where v.choice = 'a'))::integer,
         (count(v.user_id) filter (where v.choice = 'b'))::integer
  from public.battles b
  left join public.battle_votes v on v.battle_id = b.id
  where b.id = any (p_ids) and b.hidden_at is null
  group by b.id
$$;

-- Battle wins per album over all visible battles, best Wilson score first
create function public.album_leaderboard(p_min_votes integer, p_limit integer)
returns table (album_id text, album jsonb, wins integer, votes integer)
language sql
stable
security definer
set search_path = ''
as $$
  with per_battle as (
    select b.id, b.created_at, b.album_a_id, b.album_a, b.album_b_id, b.album_b,
           count(v.user_id) filter (where v.choice = 'a') as wins_a,
           count(v.user_id) filter (where v.choice = 'b') as wins_b
    from public.battles b
    left join public.battle_votes v on v.battle_id = b.id
    where b.hidden_at is null
    group by b.id
  ), sides as (
    select album_a_id as album_id, album_a as album, created_at, wins_a as wins, wins_a + wins_b as votes from per_battle
    union all
    select album_b_id, album_b, created_at, wins_b, wins_a + wins_b from per_battle
  )
  select album_id,
         (array_agg(album order by created_at desc))[1],
         sum(wins)::integer,
         sum(votes)::integer
  from sides
  group by album_id
  having sum(votes) >= greatest(p_min_votes, 1)
  order by public.wilson_lower_bound(sum(wins), sum(votes)) desc, sum(votes) desc, album_id
  limit least(greatest(p_limit, 1), 100)
$$;

-- ---------- moderation (admins only; each function checks is_admin() itself) ----------

create function public.require_admin() returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
end
$$;

-- Hides (p_hide = true) or restores one thing. Hiding also resolves every open report about it.
-- Returns false when the thing does not exist.
create function public.admin_set_hidden(p_type text, p_share_id uuid, p_album_id text, p_battle_id uuid, p_hide boolean, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_it boolean := false;
  owner uuid;
begin
  perform public.require_admin();

  if p_type = 'collection' then
    update public.collection_shares
       set hidden_at = case when p_hide then now() end,
           hidden_by = case when p_hide then auth.uid() end,
           hidden_reason = case when p_hide then p_reason end
     where id = p_share_id;
    found_it := found;
  elsif p_type = 'review' then
    select user_id into owner from public.collection_shares where id = p_share_id;
    if owner is not null then
      found_it := true;
      if p_hide then
        insert into public.review_hides (user_id, album_id, hidden_by, reason)
        values (owner, p_album_id, auth.uid(), p_reason)
        on conflict (user_id, album_id) do update set hidden_by = excluded.hidden_by, reason = excluded.reason, hidden_at = now();
      else
        delete from public.review_hides where user_id = owner and album_id = p_album_id;
      end if;
    end if;
  elsif p_type = 'battle' then
    update public.battles
       set hidden_at = case when p_hide then now() end,
           hidden_by = case when p_hide then auth.uid() end,
           hidden_reason = case when p_hide then p_reason end
     where id = p_battle_id;
    found_it := found;
  end if;

  if found_it and p_hide then
    update public.reports
       set resolved_at = now(), resolved_by = auth.uid(), resolution = 'hidden'
     where resolved_at is null and target_type = p_type
       and share_id is not distinct from p_share_id
       and album_id is not distinct from p_album_id
       and battle_id is not distinct from p_battle_id;
  end if;
  return found_it;
end
$$;

-- The share id behind a slug, hidden or not (for "Restore")
create function public.admin_share_id(p_slug text) returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return (select id from public.collection_shares where slug = p_slug);
end
$$;

-- Resolves one report: 'hide' hides its target (and closes all reports about it), 'dismiss' just closes it
create function public.admin_resolve_report(p_report_id uuid, p_action text, p_reason text) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reports;
begin
  perform public.require_admin();
  select * into r from public.reports where id = p_report_id;
  if not found then
    return false;
  end if;
  if p_action = 'hide' then
    return public.admin_set_hidden(r.target_type, r.share_id, r.album_id, r.battle_id, true, p_reason);
  end if;
  update public.reports set resolved_at = now(), resolved_by = auth.uid(), resolution = 'dismissed'
   where id = p_report_id and resolved_at is null;
  return true;
end
$$;

-- The moderation queue with a short preview of each reported thing (newest first, at most 200)
create function public.admin_list_reports(p_open boolean) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.require_admin();
  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb) into result
  from (
    select r.created_at, jsonb_build_object(
      'id', r.id,
      'targetType', r.target_type,
      'reason', r.reason,
      'details', r.details,
      'createdAt', r.created_at,
      'resolvedAt', r.resolved_at,
      'resolution', r.resolution,
      'slug', s.slug,
      'albumId', r.album_id,
      'battleId', r.battle_id,
      'collectionName', c.name,
      'albumName', e.album ->> 'name',
      'review', left(e.review, 300),
      'battleNames', case when b.id is not null then (b.album_a ->> 'name') || ' vs ' || (b.album_b ->> 'name') end,
      'hidden', case r.target_type
                  when 'collection' then s.hidden_at is not null
                  when 'review' then h.user_id is not null
                  else b.hidden_at is not null end
    ) as row_data
    from public.reports r
    left join public.collection_shares s on s.id = r.share_id
    left join public.collections c on c.user_id = s.user_id and c.id = s.collection_id
    left join public.library_entries e on r.album_id is not null and e.user_id = s.user_id and e.album_id = r.album_id
    left join public.review_hides h on r.album_id is not null and h.user_id = s.user_id and h.album_id = r.album_id
    left join public.battles b on b.id = r.battle_id
    where (r.resolved_at is null) = p_open
    order by r.created_at desc
    limit 200
  ) rows;
  return result;
end
$$;
