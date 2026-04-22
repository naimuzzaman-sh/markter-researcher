-- Migration: fix contacts upsert by replacing the partial unique index with
-- a full unique index.
--
-- Problem: the original migration created
--   CREATE UNIQUE INDEX contacts_owner_linkedin_unique
--     ON contacts(owner_id, linkedin_url)
--     WHERE linkedin_url IS NOT NULL;
--
-- That PARTIAL index cannot be targeted by Postgres's
--   INSERT ... ON CONFLICT (owner_id, linkedin_url) DO UPDATE ...
-- which is what Supabase's `.upsert(..., { onConflict: 'owner_id,linkedin_url' })`
-- emits. Result: "there is no unique or exclusion constraint matching the ON
-- CONFLICT specification" on every discovered candidate.
--
-- Fix: drop the partial index, create a full one. Postgres's default NULLS
-- DISTINCT semantics still allow multiple contacts with NULL linkedin_url
-- (they aren't considered equal), so no data-model regression.

drop index if exists public.contacts_owner_linkedin_unique;

create unique index contacts_owner_linkedin_unique
  on public.contacts(owner_id, linkedin_url);
