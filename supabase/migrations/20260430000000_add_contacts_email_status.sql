-- Migration: track per-contact email deliverability state so the invite
-- flow can short-circuit re-sends to addresses that hard-bounced or
-- generated a complaint. Webhook handler at POST /webhooks/resend writes
-- here; the invite_candidate tool reads here before sending.
--
-- States:
--   unknown      — never sent / never received an event (default)
--   delivered    — Resend confirmed the recipient SMTP accepted
--   bounced      — hard bounce (mailbox doesn't exist, blocked, etc.)
--                  Suppress future sends; flag for the researcher
--   complained   — recipient marked as spam. Hardest suppression — never
--                  re-send under any circumstance
--   unsubscribed — explicit opt-out (not currently emitted but reserved)
--
-- We deliberately don't model "soft bounce" as its own state — Resend
-- retries internally before surfacing a bounce event, so by the time
-- we see one it's effectively hard.

alter table public.contacts
  add column if not exists email_status text not null default 'unknown'
    check (email_status in ('unknown', 'delivered', 'bounced', 'complained', 'unsubscribed')),
  add column if not exists email_status_at timestamptz,
  add column if not exists email_status_reason text;

-- Lookup index for the webhook handler: when an event arrives we have
-- the recipient address, not the contact id. Per-owner uniqueness
-- isn't asserted here (a contact can legitimately not have an email
-- yet, and across owners the same address may appear).
create index if not exists contacts_email_idx
  on public.contacts(email)
  where email is not null;
