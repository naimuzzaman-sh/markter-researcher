import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  createElevenLabsAgent,
  deleteElevenLabsAgent,
  verifyElevenLabsWebhook,
} from './elevenlabs';

describe('createElevenLabsAgent', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs agent-create with xi-api-key + returns agent_id', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ agent_id: 'a1' }) });
    const id = await createElevenLabsAgent({
      apiKey: 'k',
      voiceId: 'v',
      systemPrompt: 'sp',
      firstMessage: 'fm',
      language: 'en',
    });
    expect(id).toBe('a1');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.elevenlabs.io/v1/convai/agents/create');
    expect(init.headers['xi-api-key']).toBe('k');
    const body = JSON.parse(init.body);
    expect(body.conversation_config.tts.voice_id).toBe('v');
    expect(body.conversation_config.agent.first_message).toBe('fm');
    // end_call system tool always registered
    expect(body.conversation_config.agent.prompt.tools[0].name).toBe('end_call');
  });

  it('throws upstream on non-2xx', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'err',
      text: async () => 'boom',
    });
    await expect(
      createElevenLabsAgent({
        apiKey: 'k', voiceId: 'v', systemPrompt: 'p', firstMessage: 'f', language: 'en',
      }),
    ).rejects.toThrow(/ElevenLabs agent create failed/);
  });

  it('throws when response missing agent_id', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(
      createElevenLabsAgent({
        apiKey: 'k', voiceId: 'v', systemPrompt: 'p', firstMessage: 'f', language: 'en',
      }),
    ).rejects.toThrow(/missing agent_id/);
  });
});

describe('deleteElevenLabsAgent', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends DELETE with xi-api-key', async () => {
    await deleteElevenLabsAgent('k', 'agent-id');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.elevenlabs.io/v1/convai/agents/agent-id');
    expect(init.method).toBe('DELETE');
    expect(init.headers['xi-api-key']).toBe('k');
  });
});

describe('verifyElevenLabsWebhook', () => {
  const secret = 'shh';
  const body = '{"event":"call.ended"}';
  const valid = createHmac('sha256', secret).update(body).digest('hex');

  it('returns true on matching signature', () => {
    expect(verifyElevenLabsWebhook(secret, body, valid)).toBe(true);
  });

  it('returns false on mismatched signature', () => {
    const wrong = createHmac('sha256', 'other').update(body).digest('hex');
    expect(verifyElevenLabsWebhook(secret, body, wrong)).toBe(false);
  });

  it('returns false when secret is empty (fail-closed)', () => {
    expect(verifyElevenLabsWebhook('', body, valid)).toBe(false);
  });

  it('returns false for wrong-length signature', () => {
    expect(verifyElevenLabsWebhook(secret, body, 'short')).toBe(false);
  });
});
