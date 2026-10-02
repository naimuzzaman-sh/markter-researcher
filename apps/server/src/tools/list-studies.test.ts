import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config';
import { listStudiesTool } from './list-studies';

vi.mock('../db/studies', () => ({
  listStudiesByOwner: vi.fn(async () => [
    { id: 'b1', researchContext: { company: { name: 'Co' } }, createdAt: new Date('2026-04-20T10:00:00Z') },
  ]),
}));

const cfg: Config = {
  port: 3001, nodeEnv: 'test', webOrigins: ['http://localhost:5173'],
  webOrigin: 'http://localhost:5173', supabaseUrl: 'x', supabaseAnonKey: 'x',
  geminiApiKey: 'x', exaApiKey: 'x', openaiApiKey: 'x', elevenlabsApiKey: 'x',
  elevenlabsVoiceId: 'x', elevenlabsWebhookSecret: 'x',
  resendApiKey: 'x', resendFromEmail: 'research@example.com',
  resendWebhookSecret: '',
};

describe('listStudiesTool', () => {
  it('name + description + schema are set', () => {
    expect(listStudiesTool.name).toBe('list_studies');
    expect(listStudiesTool.description).toBeTypeOf('string');
    expect(listStudiesTool.inputSchema).toBeDefined();
  });

  it('defaults limit to 20', async () => {
    const { listStudiesByOwner } = await import('../db/studies');
    const ctx = { userId: 'u1', userEmail: null, supabase: {} as SupabaseClient, config: cfg };
    await listStudiesTool.execute({}, ctx);
    expect(listStudiesByOwner).toHaveBeenCalledWith(ctx.supabase, 'u1', 20);
  });

  it('honours custom limit', async () => {
    const { listStudiesByOwner } = await import('../db/studies');
    const ctx = { userId: 'u1', userEmail: null, supabase: {} as SupabaseClient, config: cfg };
    await listStudiesTool.execute({ limit: 5 }, ctx);
    expect(listStudiesByOwner).toHaveBeenCalledWith(ctx.supabase, 'u1', 5);
  });

  it('serializes dates to ISO strings in the wire shape', async () => {
    const ctx = { userId: 'u1', userEmail: null, supabase: {} as SupabaseClient, config: cfg };
    const result = await listStudiesTool.execute({}, ctx);
    expect(result[0].studyId).toBe('b1');
    expect(typeof result[0].createdAt).toBe('string');
  });
});
