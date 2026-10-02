import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { sendInterviewInvite, verifyResendWebhook } from './resend';

describe('sendInterviewInvite', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs to /emails with bearer auth and the invite body', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ id: 'em_1' }) });
    const result = await sendInterviewInvite({
      apiKey: 'key',
      from: 'r@me.com',
      to: 'c@them.com',
      productName: 'Dynt',
      interviewUrl: 'https://app/interview/abc',
    });
    expect(result).toEqual({ id: 'em_1' });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer key');
    const body = JSON.parse(init.body);
    expect(body.from).toBe('r@me.com');
    expect(body.to).toEqual(['c@them.com']);
    expect(body.subject).toContain('Dynt');
    expect(body.text).toContain('https://app/interview/abc');
  });

  it('attaches reply_to when provided', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ id: 'em_1' }) });
    await sendInterviewInvite({
      apiKey: 'k',
      from: 'r@me.com',
      to: 'c@them.com',
      replyTo: 'researcher@co.com',
      productName: 'Dynt',
      interviewUrl: 'https://app/x',
    });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.reply_to).toBe('researcher@co.com');
  });

  it('omits reply_to when null', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ id: 'em_1' }) });
    await sendInterviewInvite({
      apiKey: 'k',
      from: 'r@me.com',
      to: 'c@them.com',
      replyTo: null,
      productName: 'Dynt',
      interviewUrl: 'https://app/x',
    });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.reply_to).toBeUndefined();
  });

  it('forwards Idempotency-Key when provided', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ id: 'em_1' }) });
    await sendInterviewInvite({
      apiKey: 'k',
      from: 'r@me.com',
      to: 'c@them.com',
      productName: 'Dynt',
      interviewUrl: 'https://app/x',
      idempotencyKey: 'invite-cand-123',
    });
    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers['Idempotency-Key']).toBe('invite-cand-123');
  });

  it('throws upstream on non-2xx', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => '{"message":"invalid"}',
    });
    await expect(
      sendInterviewInvite({
        apiKey: 'k',
        from: 'r@me.com',
        to: 'c@them.com',
        productName: 'X',
        interviewUrl: 'u',
      }),
    ).rejects.toThrow(/Resend send failed.*422/);
  });

  it('throws when response has no id', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(
      sendInterviewInvite({
        apiKey: 'k',
        from: 'r@me.com',
        to: 'c@them.com',
        productName: 'X',
        interviewUrl: 'u',
      }),
    ).rejects.toThrow(/no message id/);
  });
});

describe('verifyResendWebhook', () => {
  // Pick a fixed timestamp inside the tolerance window so we don't have
  // to mock Date.now. tolerance is 5 min, body uses now()-30s.
  function freshTs(): string {
    return String(Math.floor(Date.now() / 1000) - 30);
  }

  // Compute a Svix-style v1 signature given (msgId, timestamp, body, secretBase64).
  function signature(
    secretBase64: string,
    msgId: string,
    ts: string,
    body: string,
  ): string {
    const secretBytes = Buffer.from(secretBase64, 'base64');
    const sig = createHmac('sha256', secretBytes)
      .update(`${msgId}.${ts}.${body}`)
      .digest('base64');
    return `v1,${sig}`;
  }

  // 32 zero bytes base64-encoded — fixed value so the test is deterministic.
  const SECRET_B64 = Buffer.alloc(32, 0).toString('base64');

  it('accepts a valid signature', () => {
    const ts = freshTs();
    const body = '{"type":"email.delivered"}';
    const sig = signature(SECRET_B64, 'msg_1', ts, body);
    expect(() =>
      verifyResendWebhook({
        secret: SECRET_B64,
        msgId: 'msg_1',
        timestamp: ts,
        signatureHeader: sig,
        rawBody: body,
      }),
    ).not.toThrow();
  });

  it('accepts a whsec_-prefixed secret', () => {
    const ts = freshTs();
    const body = '{}';
    const sig = signature(SECRET_B64, 'm', ts, body);
    expect(() =>
      verifyResendWebhook({
        secret: `whsec_${SECRET_B64}`,
        msgId: 'm',
        timestamp: ts,
        signatureHeader: sig,
        rawBody: body,
      }),
    ).not.toThrow();
  });

  it('accepts when ANY of multiple v1 signatures matches (key rotation)', () => {
    const ts = freshTs();
    const body = '{"x":1}';
    const realSig = signature(SECRET_B64, 'm', ts, body);
    const bogusSig = 'v1,AAAAAAAA==';
    expect(() =>
      verifyResendWebhook({
        secret: SECRET_B64,
        msgId: 'm',
        timestamp: ts,
        signatureHeader: `${bogusSig} ${realSig}`,
        rawBody: body,
      }),
    ).not.toThrow();
  });

  it('rejects when signature mismatches', () => {
    const ts = freshTs();
    const body = '{}';
    expect(() =>
      verifyResendWebhook({
        secret: SECRET_B64,
        msgId: 'm',
        timestamp: ts,
        signatureHeader: 'v1,AAAAAAAA==',
        rawBody: body,
      }),
    ).toThrow(/signature mismatch/);
  });

  it('rejects when any svix header is missing', () => {
    expect(() =>
      verifyResendWebhook({
        secret: SECRET_B64,
        msgId: null,
        timestamp: '1',
        signatureHeader: 'v1,X',
        rawBody: '{}',
      }),
    ).toThrow(/missing svix headers/);
  });

  it('rejects when timestamp is too old', () => {
    const stale = String(Math.floor(Date.now() / 1000) - 60 * 60); // 1h ago
    const body = '{}';
    const sig = signature(SECRET_B64, 'm', stale, body);
    expect(() =>
      verifyResendWebhook({
        secret: SECRET_B64,
        msgId: 'm',
        timestamp: stale,
        signatureHeader: sig,
        rawBody: body,
      }),
    ).toThrow(/timestamp out of tolerance/);
  });
});
