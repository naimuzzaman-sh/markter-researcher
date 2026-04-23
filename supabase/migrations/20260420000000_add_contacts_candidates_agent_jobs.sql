-- Migration: add network-lens-style discovery data model
--
-- Adds `contacts`, `brief_candidates`, `outreach_drafts`, `agent_jobs`,
-- and `agent_queue` tables to support the MCP discovery flow
-- (find candidates → review → approve → draft outreach → interview).
--
-- Scoping: mirrors the existing `briefs` table — application-level filtering
-- by `owner_id` (the Supabase auth user id). RLS is left disabled here to
-- match the codebase's current stance (see packages/shared/src/supabase.service.ts);
-- ready-to-enable policies are included at the bottom, commented out.
--
-- Note on `companies`: an unrelated `companies` table already exists in
-- this database (org/brand-voice metadata from an earlier phase). We do not
-- touch it. Contact-level company info is stored inline on `contacts`
-- (`company_name`, `company_domain`) for M1. A separate enrichment table
-- can be introduced later under a different name (e.g. `contact_companies`).
--
-- Prerequisites:
--   - pgvector extension (for contacts.embedding). Supabase exposes this as
--     a toggle under Database → Extensions, or via the CREATE EXTENSION below.
--   - `briefs` table with column `id uuid pk` (already present).
--   - `interviews` table with column `id uuid pk` (already present).

create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- ---------------------------------------------------------------------------
-- contacts: one row per person, per owner
-- ---------------------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  linkedin_url text,
  title text,
  company_name text,
  company_domain text,
  email text,
  location text,
  profile_json jsonb,
  research_notes text,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_owner_idx on public.contacts(owner_id);
create unique index if not exists contacts_owner_linkedin_unique
  on public.contacts(owner_id, linkedin_url)
  where linkedin_url is not null;

-- ---------------------------------------------------------------------------
-- brief_candidates: contact ↔ brief link with funnel status
-- ---------------------------------------------------------------------------
create table if not exists public.brief_candidates (
  id uuid primary key default uuid_generate_v4(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'discovered'
    check (status in ('discovered','pending_review','approved','contacted','scheduled','interviewed','rejected')),
  source text not null default 'discovery'
    check (source in ('discovery','manual','import')),
  match_score numeric check (match_score is null or (match_score >= 0 and match_score <= 1)),
  interview_id uuid references public.interviews(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brief_id, contact_id)
);

create index if not exists brief_candidates_brief_idx on public.brief_candidates(brief_id);
create index if not exists brief_candidates_contact_idx on public.brief_candidates(contact_id);
create index if not exists brief_candidates_status_idx on public.brief_candidates(status);

-- ---------------------------------------------------------------------------
-- outreach_drafts: staged messages held for human approval
-- ---------------------------------------------------------------------------
create table if not exists public.outreach_drafts (
  id uuid primary key default uuid_generate_v4(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null check (channel in ('email','linkedin')),
  subject text,
  body text not null,
  status text not null default 'draft'
    check (status in ('draft','approved','sent','rejected')),
  approved_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_drafts_brief_idx on public.outreach_drafts(brief_id);
create index if not exists outreach_drafts_contact_idx on public.outreach_drafts(contact_id);
create index if not exists outreach_drafts_status_idx on public.outreach_drafts(status);

-- ---------------------------------------------------------------------------
-- agent_jobs: generic async job table (polled by NestJS @Cron worker)
-- ---------------------------------------------------------------------------
create table if not exists public.agent_jobs (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('discovery','research','outreach')),
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed')),
  input_json jsonb,
  output_json jsonb,
  error text,
  cost_usd numeric,
  tokens_used integer,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists agent_jobs_owner_idx on public.agent_jobs(owner_id);
create index if not exists agent_jobs_status_idx on public.agent_jobs(status);
create index if not exists agent_jobs_status_created_idx
  on public.agent_jobs(status, created_at)
  where status = 'queued';

-- ---------------------------------------------------------------------------
-- agent_queue: items awaiting user review (discovered candidates, outreach drafts)
-- ---------------------------------------------------------------------------
create table if not exists public.agent_queue (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('candidate','outreach_draft')),
  ref_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists agent_queue_owner_idx on public.agent_queue(owner_id);
create index if not exists agent_queue_status_idx on public.agent_queue(status);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'touch_contacts_updated') then
    create trigger touch_contacts_updated before update on public.contacts
      for each row execute function public.touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'touch_brief_candidates_updated') then
    create trigger touch_brief_candidates_updated before update on public.brief_candidates
      for each row execute function public.touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'touch_outreach_drafts_updated') then
    create trigger touch_outreach_drafts_updated before update on public.outreach_drafts
      for each row execute function public.touch_updated_at();
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- RLS policies (commented out — enable when the codebase flips from
-- application-level scoping to RLS-enforced scoping across all tables)
-- ---------------------------------------------------------------------------
-- alter table public.contacts enable row level security;
-- alter table public.brief_candidates enable row level security;
-- alter table public.outreach_drafts enable row level security;
-- alter table public.agent_jobs enable row level security;
-- alter table public.agent_queue enable row level security;
--
-- create policy "contacts owner read" on public.contacts
--   for select using (owner_id = auth.uid());
-- create policy "contacts owner write" on public.contacts
--   for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- -- brief_candidates / outreach_drafts derive ownership via brief_id -> briefs.owner_id
