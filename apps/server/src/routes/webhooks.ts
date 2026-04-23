import { Hono } from 'hono';
import type { Config } from '../config';
import type { Logger } from '../lib/logger';
import { AppError } from '../lib/errors';
import { verifyElevenLabsWebhook } from '../external/elevenlabs';

/**
 * ElevenLabs webhook endpoint.
 *
 * In our call flow the frontend drives end-of-call via `POST /calls/:id/end`
 * (it knows when the user hangs up). The webhook is kept as an optional
 * belt-and-suspenders signal for post-call events the ElevenLabs dashboard
 * dispatches (e.g. call_ended in analytics, agent_deleted). Signature
 * verification is mandatory — we refuse any unsigned payload.
 */
export function createWebhooksRoute(deps: { config: Config; logger: Logger }) {
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

  return app;
}
