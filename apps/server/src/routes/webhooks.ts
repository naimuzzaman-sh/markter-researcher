import { Hono } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config';
import type { Logger } from '../lib/logger';
import { AppError } from '../lib/errors';
import { verifyElevenLabsWebhook } from '../external/elevenlabs';
import { verifyResendWebhook } from '../external/resend';
import { findContactsByEmail, updateContactEmailStatus } from '../db/contacts';

/**
 * ElevenLabs webhook endpoint.
 *
 * In our call flow the frontend drives end-of-call via `POST /calls/:id/end`
 * (it knows when the user hangs up). The webhook is kept as an optional
 * belt-and-suspenders signal for post-call events the ElevenLabs dashboard
 * dispatches (e.g. call_ended in analytics, agent_deleted). Signature
 * verification is mandatory — we refuse any unsigned payload.
 */
export function createWebhooksRoute(deps: {
  config: Config;
  logger: Logger;
  supabase: SupabaseClient;
}) {
  const app = new Hono();

  app.post('/webhooks/elevenlabs', async (c) => {
    const raw = await c.req.text();
    const signature =
      c.req.header('elevenlabs-signature') ?? c.req.header('x-signature') ?? '';

    if (!verifyElevenLabsWebhook(deps.config.elevenlabsWebhookSecret, raw, signature)) {
      throw new AppError('unauthorized', 'Invalid ElevenLabs webhook signature');
    }

    // Parse + log — we currently don't react to webhook events (the primary
    // finalization path is /calls/:id/end). Extend this handler when we need
    // server-initiated reactions.
    let payload: unknown = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      // Body was already signed — signature matched — but it wasn't JSON.
      // Acknowledge and log for manual review.
    }
    deps.logger.info('elevenlabs webhook received', {
      event: (payload as { event?: string } | null)?.event ?? 'unknown',
    });

    return c.json({ ok: true });
  });

  // ─────────────────────────────────────────────────────────────────
  // Resend webhook (Svix-format signature). Handles three event types:
  //   email.delivered  — informational; bumps email_status → 'delivered'
  //   email.bounced    — hard bounce → mark as 'bounced' (suppress sends)
  //   email.complained — spam report → mark as 'complained' (hardest)
  //
  // We intentionally don't forward to a queue or dedicated events table:
  // the contact's `email_status` column is the authoritative state the
  // invite tool reads on next-send. If we need a full audit log later,
  // add an `email_events` table without changing the semantics here.
  // ─────────────────────────────────────────────────────────────────
  app.post('/webhooks/resend', async (c) => {
    const raw = await c.req.text();

    try {
      verifyResendWebhook({
        secret: deps.config.resendWebhookSecret,
        msgId: c.req.header('svix-id') ?? null,
        timestamp: c.req.header('svix-timestamp') ?? null,
        signatureHeader: c.req.header('svix-signature') ?? null,
        rawBody: raw,
      });
    } catch (err) {
      // Re-throw so the standard error middleware emits 401.
      throw err;
    }

    let payload: ResendWebhookPayload;
    try {
      payload = JSON.parse(raw) as ResendWebhookPayload;
    } catch {
      throw new AppError('validation', 'Resend webhook body is not valid JSON');
    }

    const eventType = payload.type;
    const recipient = extractRecipient(payload);
    if (!recipient) {
      // Acknowledge — don't fail — when an event we don't care about
      // arrives without a recipient. Failing would make Resend retry.
      deps.logger.info('resend webhook: no recipient', { type: eventType });
      return c.json({ ok: true });
    }

    const status = mapEventToStatus(eventType);
    if (!status) {
      deps.logger.info('resend webhook: ignored event type', { type: eventType });
      return c.json({ ok: true });
    }

    const reason = extractReason(payload);
    const contacts = await findContactsByEmail(deps.supabase, recipient);

    // The same email can appear under multiple owners (different
    // researchers discover the same person). Update them all — bounce
    // is bounce regardless of which owner triggered the send.
    await Promise.all(
      contacts.map((contact) =>
        updateContactEmailStatus(deps.supabase, contact.id, status, reason),
      ),
    );

    deps.logger.info('resend webhook: applied', {
      type: eventType,
      status,
      recipient,
      affectedContacts: contacts.length,
    });

    return c.json({ ok: true });
  });

  return app;
}

// Resend payload shapes we care about. Other event types may arrive;
// we tolerate-and-ignore them via the `mapEventToStatus` switch.
type ResendWebhookPayload = {
  type: string;
  data?: {
    to?: string | string[];
    email_id?: string;
    bounce?: { message?: string; sub_type?: string };
    complaint?: { message?: string };
  };
};

function extractRecipient(payload: ResendWebhookPayload): string | null {
  const to = payload.data?.to;
  if (typeof to === 'string') return to;
  if (Array.isArray(to) && to.length > 0) return to[0];
  return null;
}

function mapEventToStatus(
  eventType: string,
): 'delivered' | 'bounced' | 'complained' | null {
  switch (eventType) {
    case 'email.delivered':
      return 'delivered';
    case 'email.bounced':
      return 'bounced';
    case 'email.complained':
      return 'complained';
    default:
      return null;
  }
}

function extractReason(payload: ResendWebhookPayload): string | null {
  if (payload.data?.bounce?.message) return payload.data.bounce.message;
  if (payload.data?.bounce?.sub_type) return payload.data.bounce.sub_type;
  if (payload.data?.complaint?.message) return payload.data.complaint.message;
  return null;
}
