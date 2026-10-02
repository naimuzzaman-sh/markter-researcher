-- Migration: brief drafts + persisted chat history per brief.
--
-- Adds two columns to `briefs`:
--   status        — 'draft' | 'active'. Defaults to 'active' so existing
--                   rows (created via the old fully-validated create_brief)
--                   stay completed without a backfill UPDATE.
--   chat_history  — append-only jsonb log of the conversation that
--                   produced/edits this brief. Each item is
--                   { role, content, artifact?, artifactRef? }.
--                   Defaults to '[]' so list/get queries can rely on
--                   the column being a non-null array.
--
-- Why a column on briefs and not a separate table:
--   - One thread per brief (per the design discussion); 1:1 relationship
--   - Reads always co-located with the brief itself
--   - We can split into `brief_chat_messages` later if we need indexing,
--     pagination, or full-text search across messages
--
-- Index considerations: status is the obvious filter for "show me my
-- draft briefs". A partial index on status='draft' is right because
-- (a) most briefs end up active, (b) the list_briefs default ordering
-- is by created_at desc which a partial index can co-cluster on.

alter table public.briefs
  add column if not exists status text not null default 'active'
    check (status in ('draft', 'active')),
  add column if not exists chat_history jsonb not null default '[]'::jsonb;

create index if not exists briefs_owner_drafts_idx
  on public.briefs(owner_id, created_at desc)
  where status = 'draft';


