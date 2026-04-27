import { describe, it, expect, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: vi.fn((url: string, key: string) => ({ url, key })),
  };
});

import { createSupabaseClient } from './supabase';
import type { Config } from '../config';

const cfg: Config = {
  port: 3001,
  nodeEnv: 'test',
  webOrigins: ['http://localhost:5173'],
  webOrigin: 'http://localhost:5173',
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'anon',
  geminiApiKey: 'g',
  exaApiKey: 'e',
  openaiApiKey: 'o',
  elevenlabsApiKey: 'el',
  elevenlabsVoiceId: 'v',
  elevenlabsWebhookSecret: 's',
  resendApiKey: 'r',
  resendFromEmail: 'research@example.com',
};

describe('createSupabaseClient', () => {
  it('passes config through to createClient', () => {
    const client = createSupabaseClient(cfg) as unknown as {
      url: string;
      key: string;
    };
    expect(client.url).toBe(cfg.supabaseUrl);
    expect(client.key).toBe(cfg.supabaseAnonKey);
  });
});
