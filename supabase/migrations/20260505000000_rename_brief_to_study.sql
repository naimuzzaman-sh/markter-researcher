-- Migration: rename `brief` → `study` end-to-end.
--
-- "Study" is the more accurate noun for what these rows represent:
-- a research study, with a research_context, a chat history, a set of
-- candidates, and aggregated results across interviews. "Brief" was an
-- inherited shortcut from the early prototype.
--
-- Renames:
--   table  briefs            → studies
--   table  brief_candidates  → study_candidates
--   col    brief_id (study_candidates, interviews, outreach_drafts)
--          → study_id
--   indexes / FK / unique / trigger names follow the table rename
--
-- This migration is purely structural — no data is copied or transformed.
-- Postgres preserves row data through `alter table … rename`. Existing FKs
-- continue to reference the renamed table; the constraint metadata is
-- updated below for cosmetic naming consistency.
--
-- Best-effort renames (constraints, triggers) are wrapped in DO blocks so
-- the migration succeeds even if Supabase auto-named these objects with
-- a different scheme on previous runs. Skipping a cosmetic rename never
-- breaks the schema; failing here would.

-- ──────────────────────────── Tables ────────────────────────────
alter table public.briefs rename to studies;
alter table public.brief_candidates rename to study_candidates;

-- ──────────────────────────── Columns ───────────────────────────
alter table public.study_candidates rename column brief_id to study_id;
alter table public.interviews rename column brief_id to study_id;
alter table public.outreach_drafts rename column brief_id to study_id;

-- ──────────────────────────── Indexes ───────────────────────────
-- Explicit indexes named in the prior migrations follow the table.
alter index if exists briefs_owner_drafts_idx rename to studies_owner_drafts_idx;
alter index if exists brief_candidates_brief_idx rename to study_candidates_study_idx;
alter index if exists brief_candidates_contact_idx rename to study_candidates_contact_idx;
alter index if exists brief_candidates_status_idx rename to study_candidates_status_idx;
alter index if exists outreach_drafts_brief_idx rename to outreach_drafts_study_idx;

-- ────────────────── Auto-named FK / unique constraints ──────────────────
-- These names are best-effort guesses based on Postgres' default naming
-- (`<table>_<col>_fkey`, `<table>_<col1>_<col2>_key`). Wrap each in a
-- DO block so a missing/differently-named constraint doesn't abort the
-- whole migration — the constraint still exists with whatever name PG
-- gave it; only the cosmetic label is out of date.

do $$
begin
  alter table public.study_candidates
    rename constraint brief_candidates_brief_id_fkey
    to study_candidates_study_id_fkey;
exception when undefined_object then null;
end$$;

do $$
begin
  alter table public.study_candidates
    rename constraint brief_candidates_brief_id_contact_id_key
    to study_candidates_study_id_contact_id_key;
exception when undefined_object then null;
end$$;

do $$
begin
  alter table public.interviews
    rename constraint interviews_brief_id_fkey
    to interviews_study_id_fkey;
exception when undefined_object then null;
end$$;

do $$
begin
  alter table public.outreach_drafts
    rename constraint outreach_drafts_brief_id_fkey
    to outreach_drafts_study_id_fkey;
exception when undefined_object then null;
end$$;

-- ──────────────────────────── Trigger ───────────────────────────
do $$
begin
  alter trigger touch_brief_candidates_updated on public.study_candidates
    rename to touch_study_candidates_updated;
exception when undefined_object then null;
end$$;
