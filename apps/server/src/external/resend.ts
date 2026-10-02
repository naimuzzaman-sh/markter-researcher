import { createHmac, timingSafeEqual } from 'crypto';
import { AppError } from '../lib/errors';

/**
 * Thin wrapper around Resend's REST API. We stay on `fetch` to avoid
 * pulling in their SDK for one endpoint — the contract is small.
 *
 * Errors collapse to AppError so callers can let them propagate up to
 * the standard error middleware.
 */

type SendInterviewInviteInput = {
  apiKey: string;
  from: string;
  to: string;
  /** Researcher's email — recipient's "Reply" goes here, not to noreply. */
  replyTo?: string | null;
  productName: string;
  interviewUrl: string;
  /**
   * Stable client-side key. Resend dedupes within a short window when
   * this header is present, so accidental double-clicks don't fan out
   * into duplicate invites.
   */
  idempotencyKey?: string;
};

export type SendResult = { id: string };

export async function sendInterviewInvite(
  input: SendInterviewInviteInput,
): Promise<SendResult> {
  const subject = `Quick research interview · ${input.productName}`;
  const text =
    `Hi,\n\n` +
    `I'm running a quick research interview about ${input.productName}.\n` +
    `Should take 5–10 minutes — voice-based, no scheduling needed.\n\n` +
    `${input.interviewUrl}\n\n` +
    `Thanks for helping out.`;

  const body: Record<string, unknown> = {
    from: input.from,
    to: [input.to],
    subject,
    text,
  };
  // Only attach reply_to when we actually have a researcher email — an
  // empty/null value sent to Resend gets silently rejected.
  if (input.replyTo) body.reply_to = input.replyTo;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.apiKey}`,
    'Content-Type': 'application/json',
  };
  if (input.idempotencyKey) headers['Idempotency-Key'] = input.idempotencyKey;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const responseBody = await res.text().catch(() => '');
    throw new AppError(
      'upstream',
      `Resend send failed (HTTP ${res.status}): ${responseBody.slice(0, 200)}`,
    );
  }

  const json = (await res.json().catch(() => null)) as { id?: string } | null;
  if (!json?.id) {
    throw new AppError('upstream', 'Resend returned no message id');
  }
  return { id: json.id };
}

// ─────────────────────────────────────────────────────────────────────────
// Webhook signature verification (Svix-style — Resend uses Svix as their
// webhook delivery layer).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Verify a Svix-format webhook signature. Resend signs with HMAC-SHA256
 * over `${msgId}.${timestamp}.${body}`, base64-encodes, and prefixes
 * with `v1,`. The header carries one or more signatures separated by
 * spaces (key rotation) — we accept the request if any of them matches.
 *
 * The webhook secret is provisioned in Resend's dashboard as a string
 * starting with `whsec_`. Strip that prefix before base64-decoding.
 *
 * Throws AppError('unauthorized') on mismatch / missing headers /
 * stale timestamp. Caller can let it propagate to the error middleware.
 */
export function verifyResendWebhook(input: {
  secret: string;
  msgId: string | null;
  timestamp: string | null;
  signatureHeader: string | null;
  rawBody: string;
  /** Reject if the signature is older than this many seconds. Default 5min. */
  toleranceSecs?: number;
}): void {
  if (!input.msgId || !input.timestamp || !input.signatureHeader) {
    throw new AppError('unauthorized', 'Webhook missing svix headers');
  }

  // Replay-window check. A signed body older than the tolerance is
  // either a misconfigured client or a replay attack.
  const tolerance = input.toleranceSecs ?? 5 * 60;
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) {
    throw new AppError('unauthorized', 'Webhook timestamp not numeric');
  }
  const age = Math.abs(Date.now() / 1000 - ts);
  if (age > tolerance) {
    throw new AppError('unauthorized', 'Webhook timestamp out of tolerance');
  }

  const secretBytes = decodeWebhookSecret(input.secret);
  const signed = `${input.msgId}.${input.timestamp}.${input.rawBody}`;
  const expected = createHmac('sha256', secretBytes).update(signed).digest('base64');

  // Header format: "v1,<sig> v1,<sig2>" — multiple signatures support
  // key rotation. Accept if any match.
  const candidates = input.signatureHeader
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('v1,'))
    .map((part) => part.slice(3));

  const expectedBuf = Buffer.from(expected, 'base64');
  for (const candidate of candidates) {
    let candidateBuf: Buffer;
    try {
      candidateBuf = Buffer.from(candidate, 'base64');
    } catch {
      continue;
    }
    if (
      candidateBuf.length === expectedBuf.length &&
      timingSafeEqual(candidateBuf, expectedBuf)
    ) {
      return;
    }
  }
  throw new AppError('unauthorized', 'Webhook signature mismatch');
}

/**
 * Resend's secrets come prefixed with `whsec_` and the suffix is the
 * base64 of the actual HMAC key. Some configurations in dev expose the
 * raw value without the prefix — accept both.
 */
function decodeWebhookSecret(secret: string): Buffer {
  const trimmed = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  return Buffer.from(trimmed, 'base64');
}
