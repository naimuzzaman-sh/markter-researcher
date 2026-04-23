import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config';
import { listBriefsTool } from './list-briefs';

vi.mock('../db/briefs', () => ({
  listBriefsByOwner: vi.fn(async () => [
    { id: 'b1', researchContext: { company: { name: 'Co' } }, createdAt: new Date('2026-04-20T10:00:00Z') },
  ]),
}));

const cfg: Config = {
  port: 3001, nodeEnv: 'test', webOrigins: [], supabaseUrl: 'x', supabaseAnonKey: 'x',
  geminiApiKey: 'x', exaApiKey: 'x', openaiApiKey: 'x', elevenlabsApiKey: 'x',
  elevenlabsVoiceId: 'x', elevenlabsWebhookSecret: 'x',
};

describe('listBriefsTool', () => {
  it('name + description + schema are set', () => {
    expect(listBriefsTool.name).toBe('list_briefs');
    expect(listBriefsTool.description).toBeTypeOf('string');
    expect(listBriefsTool.inputSchema).toBeDefined();
  });

  it('defaults limit to 20', async () => {
    const { listBriefsByOwner } = await import('../db/briefs');
    const ctx = { userId: 'u1', supabase: {} as SupabaseClient, config: cfg };
    await listBriefsTool.execute({}, ctx);
    expect(listBriefsByOwner).toHaveBeenCalledWith(ctx.supabase, 'u1', 20);
  });

  it('honours custom limit', async () => {
    const { listBriefsByOwner } = await import('../db/briefs');
    const ctx = { userId: 'u1', supabase: {} as SupabaseClient, config: cfg };
    await listBriefsTool.execute({ limit: 5 }, ctx);
    expect(listBriefsByOwner).toHaveBeenCalledWith(ctx.supabase, 'u1', 5);
  });

  it('serializes dates to ISO strings in the wire shape', async () => {
    const ctx = { userId: 'u1', supabase: {} as SupabaseClient, config: cfg };
    const result = await listBriefsTool.execute({}, ctx);
    expect(result[0].briefId).toBe('b1');
    expect(typeof result[0].createdAt).toBe('string');
  });
});
