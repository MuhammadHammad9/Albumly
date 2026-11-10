-- Albumly library tables.
-- They mirror the Phase 4 local library (client/src/services/library/schema.js), so moving a
-- library from the browser into an account is a straight upload. Every row belongs to one user
-- (auth.users is Supabase's own table of accounts); deleting the account deletes the rows.

-- One row per account, for details that are not library data
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username is null or char_length(username) between 3 and 30),
  created_at timestamptz not null default now()
);

-- Tags are lowercase, trimmed, at most 30 characters, never empty and never repeated
create function public.tags_are_valid(tags text[]) returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(tag is not null and tag = lower(btrim(tag)) and char_length(tag) between 1 and 30), true)
     and count(*) = count(distinct tag)
  from unnest(tags) as tag
$$;

-- One saved album per row. `album` is the snapshot the client shows without asking Spotify.
create table public.library_entries (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  album_id text not null check (album_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  album jsonb not null check (
    jsonb_typeof(album) = 'object'
    and album ->> 'id' = album_id
    and pg_column_size(album) <= 20000
  ),
  status text check (status in ('favourite', 'want', 'listening', 'listened')),
  rating smallint check (rating between 1 and 10),
  review text not null default '' check (char_length(review) <= 5000),
  notes text not null default '' check (char_length(notes) <= 5000),
  tags text[] not null default '{}' check (cardinality(tags) <= 20 and public.tags_are_valid(tags)),
  added_at timestamptz not null,
  -- Set by the client: "the newest updated_at wins" when two copies disagree
  updated_at timestamptz not null,
  primary key (user_id, album_id)
);

-- The id is made by the client (so it never changes on upload) and only needs to be unique per user
create table public.collections (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  description text not null default '' check (char_length(description) <= 500),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

-- "Favourites" and "favourites" count as the same name
create unique index collections_user_name_key on public.collections (user_id, lower(name));

-- Which albums are in which collection, and in what order (the many-to-many table).
-- Both foreign keys include user_id, so a collection can only hold albums that the same user saved.
create table public.collection_albums (
  user_id uuid not null default auth.uid(),
  collection_id text not null,
  album_id text not null,
  position integer not null check (position >= 0),
  added_at timestamptz not null default now(),
  primary key (user_id, collection_id, album_id),
  foreign key (user_id, collection_id) references public.collections (user_id, id) on delete cascade,
  foreign key (user_id, album_id) references public.library_entries (user_id, album_id) on delete cascade
);

-- Removing an album looks up its collection rows by (user, album)
create index collection_albums_entry_idx on public.collection_albums (user_id, album_id);
