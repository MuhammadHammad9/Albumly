-- TEST ONLY. Never run this on the real Supabase project, which already has all of it.
-- It recreates the few Supabase pieces our migrations rely on, so the same SQL and the same
-- RLS policies can be tested in PGlite (Postgres running inside Node, no server needed).

create schema auth;

-- Supabase keeps one row per account here
create table auth.users (
  id uuid primary key,
  email text,
  -- Also in Supabase's real table; read by the instant sign-up route
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz
);

-- The roles Supabase uses: signed-out visitors, signed-in users, and the all-powerful server key
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

-- Same idea as Supabase's auth.uid(): the user id ("sub") from the request's token claims
create function auth.uid() returns uuid
language sql
stable
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
