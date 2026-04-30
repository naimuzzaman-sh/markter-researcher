import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config';
import type { Logger } from '../lib/logger';

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

vi.mock('../db/contacts', () => ({
  findContactsByEmail: vi.fn(),
  updateContactEmailStatus: vi.fn(),
}));

import { Hono } from 'hono';
import { createWebhooksRoute } from './webhooks';
import { errorHandler } from '../middleware/error-handler';
import { findContactsByEmail, updateContactEmailStatus } from '../db/contacts';

const SECRET_BYTES = Buffer.alloc(32, 0);
const SECRET_B64 = SECRET_BYTES.toString('base64');

const cfg: Config = {
  port: 3001,
  nodeEnv: 'test',
  webOrigins: ['http://localhost:5173'],
  webOrigin: 'http://localhost:5173',
  supabaseUrl: 'x',
  supabaseAnonKey: 'x',
  geminiApiKey: 'x',
  exaApiKey: 'x',
  openaiApiKey: 'x',
  elevenlabsApiKey: 'x',
  elevenlabsVoiceId: 'x',
  elevenlabsWebhookSecret: '',
  resendApiKey: 'x',
  resendFromEmail: 'r@example.com',
  resendWebhookSecret: SECRET_B64,
};

function signed(body: string, msgId = 'msg1', tsOverride?: string) {
  const ts = tsOverride ?? String(Math.floor(Date.now() / 1000));
  const sig = createHmac('sha256', SECRET_BYTES)
    .update(`${msgId}.${ts}.${body}`)
    .digest('base64');
  return {
    headers: {
      'svix-id': msgId,
      'svix-timestamp': ts,
      'svix-signature': `v1,${sig}`,
      'content-type': 'application/json',
    },
    body,
  };
}

const fakeContact = (id: string) => ({
  id,
  ownerId: 'u',
  name: 'X',
  linkedinUrl: null,
  title: null,
  companyName: null,
  companyDomain: null,
  email: 'who@where.com',
  location: null,
  profileJson: null,
  researchNotes: null,
  embedding: null,
  emailStatus: 'unknown' as const,
  emailStatusAt: null,
  emailStatusReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

beforeEach(() => {
  vi.mocked(findContactsByEmail).mockReset().mockResolvedValue([]);
  vi.mocked(updateContactEmailStatus).mockReset().mockResolvedValue();
});

function buildApp() {
  // Wrap the route in a parent Hono with the standard error middleware
  // so AppError → JSON status mapping behaves the same as in the real
  // app composition. Without this, thrown AppErrors bubble up as 500s.
  const app = new Hono();
  app.onError(errorHandler);
  app.route(
    '/',
    createWebhooksRoute({
      config: cfg,
      logger: silentLogger,
      supabase: {} as SupabaseClient,
    }),
  );
  return app;
}

describe('POST /webhooks/resend', () => {
  it('rejects when signature is missing', async () => {
    const app = buildApp();
    const res = await app.request('/webhooks/resend', {
      method: 'POST',
      body: '{"type":"email.delivered"}',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects when signature is wrong', async () => {
    const app = buildApp();
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await app.request('/webhooks/resend', {
      method: 'POST',
      body: '{"type":"email.delivered"}',
      headers: {
        'svix-id': 'm',
        'svix-timestamp': ts,
        'svix-signature': 'v1,AAAAAAAA==',
        'content-type': 'application/json',
      },
    });
    expect(res.status).toBe(401);
  });

  it('updates matching contacts to bounced on email.bounced', async () => {
    vi.mocked(findContactsByEmail).mockResolvedValue([
      fakeContact('c1'),
      fakeContact('c2'),
    ] as never);
    const body = JSON.stringify({
      type: 'email.bounced',
      data: {
        to: ['who@where.com'],
        bounce: { message: 'Mailbox not found' },
      },
    });
    const app = buildApp();
    const res = await app.request('/webhooks/resend', {
      method: 'POST',
      body,
      headers: signed(body).headers,
    });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateContactEmailStatus)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(updateContactEmailStatus).mock.calls[0][2]).toBe('bounced');
    expect(vi.mocked(updateContactEmailStatus).mock.calls[0][3]).toBe(
      'Mailbox not found',
    );
  });

  it('updates contacts to complained on email.complained', async () => {
    vi.mocked(findContactsByEmail).mockResolvedValue([fakeContact('c1')] as never);
    const body = JSON.stringify({
      type: 'email.complained',
      data: { to: 'who@where.com' },
    });
    const app = buildApp();
    const res = await app.request('/webhooks/resend', {
      method: 'POST',
      body,
      headers: signed(body).headers,
    });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateContactEmailStatus).mock.calls[0][2]).toBe('complained');
  });

  it('updates contacts to delivered on email.delivered', async () => {
    vi.mocked(findContactsByEmail).mockResolvedValue([fakeContact('c1')] as never);
    const body = JSON.stringify({
      type: 'email.delivered',
      data: { to: 'who@where.com' },
    });
    const app = buildApp();
    const res = await app.request('/webhooks/resend', {
      method: 'POST',
      body,
      headers: signed(body).headers,
    });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateContactEmailStatus).mock.calls[0][2]).toBe('delivered');
  });

  it('acknowledges-and-ignores unknown event types without DB writes', async () => {
    const body = JSON.stringify({
      type: 'email.opened',
      data: { to: 'who@where.com' },
    });
    const app = buildApp();
    const res = await app.request('/webhooks/resend', {
      method: 'POST',
      body,
      headers: signed(body).headers,
    });
    expect(res.status).toBe(200);
    expect(vi.mocked(findContactsByEmail)).not.toHaveBeenCalled();
    expect(vi.mocked(updateContactEmailStatus)).not.toHaveBeenCalled();
  });
});
