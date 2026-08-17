-- =====================================================================
-- Slate — reset a partially-created schema
--
-- Run this ONLY to clear a failed/partial run of 001_initial_schema.sql,
-- then run the full schema again.
--
-- It drops exactly the objects Slate creates, by name. It deliberately
-- does NOT run "drop schema public cascade", which would also destroy
-- objects Supabase itself keeps in that schema.
--
-- Your Supabase auth users, storage buckets and project settings live in
-- other schemas entirely and are not touched.
--
-- SAFETY: the first block refuses to drop anything if any Slate table
-- contains rows, so this cannot quietly delete real data.
-- =====================================================================

-- ---------- Safety check ----------
do $$
declare
  t text;
  n bigint;
  has_data boolean := false;
begin
  foreach t in array array[
    'organizations','users','clients','social_accounts','posts',
    'post_media','post_targets','approval_requests','approvals',
    'post_metrics','account_metrics'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then
        raise notice 'Table "%" contains % row(s)', t, n;
        has_data := true;
      end if;
    end if;
  end loop;

  if has_data then
    raise exception
      'Refusing to drop: Slate tables contain data (see notices above). '
      'If you are certain you want to erase it, delete this safety block and re-run.';
  end if;

  raise notice 'Safety check passed - no data found. Dropping schema objects.';
end $$;

-- ---------- Drop tables ----------
-- Children first, though "cascade" makes the order forgiving.
-- Dropping a table also drops its indexes, constraints and triggers.
drop table if exists account_metrics   cascade;
drop table if exists post_metrics      cascade;
drop table if exists approvals         cascade;
drop table if exists approval_requests cascade;
drop table if exists post_targets      cascade;
drop table if exists post_media        cascade;
drop table if exists posts             cascade;
drop table if exists social_accounts   cascade;
drop table if exists clients           cascade;
drop table if exists users             cascade;
drop table if exists organizations     cascade;

-- Migration bookkeeping, so the re-run is treated as a clean first run.
drop table if exists schema_migrations cascade;

-- ---------- Drop enum types ----------
-- These are what produced your "type user_role already exists" error.
drop type if exists approval_decision cascade;
drop type if exists media_type        cascade;
drop type if exists target_status     cascade;
drop type if exists post_status       cascade;
drop type if exists account_status    cascade;
drop type if exists social_platform   cascade;
drop type if exists client_status     cascade;
drop type if exists user_role         cascade;

-- ---------- Drop the helper function ----------
drop function if exists set_updated_at() cascade;

-- Note: the pgcrypto extension is intentionally left in place. Supabase
-- installs it by default and other things may rely on it; the schema
-- creates it with "if not exists" so leaving it causes no problem.

-- ---------- Confirm the slate is clean ----------
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r')  as tables_remaining,
  (select count(*) from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype = 'e')  as enum_types_remaining;
