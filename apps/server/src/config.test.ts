import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

const validEnv = {
  PORT: '3001',
  NODE_ENV: 'development',
  WEB_ORIGIN: 'http://localhost:5173',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  GEMINI_API_KEY: 'gkey',
  EXA_API_KEY: 'ekey',
  OPENAI_API_KEY: 'okey',
  ELEVENLABS_API_KEY: 'ekey',
  ELEVENLABS_VOICE_ID: 'voice',
  ELEVENLABS_WEBHOOK_SECRET: 'secret',
};

describe('loadConfig', () => {
  it('parses a valid env object', () => {
    const cfg = loadConfig(validEnv);
    expect(cfg.port).toBe(3001);
    expect(cfg.supabaseUrl).toBe('https://test.supabase.co');
    expect(cfg.nodeEnv).toBe('development');
  });

  it('defaults PORT to 3001 when unset', () => {
    const { PORT: _P, ...rest } = validEnv;
    void _P;
    const cfg = loadConfig(rest);
    expect(cfg.port).toBe(3001);
  });

  it('exposes WEB_ORIGIN as both webOrigin and webOrigins[0]', () => {
    const cfg = loadConfig({
      ...validEnv,
      WEB_ORIGIN: 'https://prod.example.com',
    });
    expect(cfg.webOrigin).toBe('https://prod.example.com');
    expect(cfg.webOrigins).toEqual(['https://prod.example.com']);
  });

  it('strips trailing slash from WEB_ORIGIN', () => {
    const cfg = loadConfig({
      ...validEnv,
      WEB_ORIGIN: 'https://prod.example.com/',
    });
    expect(cfg.webOrigin).toBe('https://prod.example.com');
  });

  it('rejects whitespace-only WEB_ORIGIN', () => {
    expect(() =>
      loadConfig({ ...validEnv, WEB_ORIGIN: '   ' }),
    ).toThrow(/WEB_ORIGIN/);
  });

  it('throws when SUPABASE_URL missing', () => {
    const { SUPABASE_URL: _S, ...rest } = validEnv;
    void _S;
    expect(() => loadConfig(rest)).toThrow(/SUPABASE_URL/);
  });

  it('throws when SUPABASE_URL is not a URL', () => {
    expect(() => loadConfig({ ...validEnv, SUPABASE_URL: 'nope' })).toThrow();
  });

  it('throws when GEMINI_API_KEY missing', () => {
    const { GEMINI_API_KEY: _G, ...rest } = validEnv;
    void _G;
    expect(() => loadConfig(rest)).toThrow(/GEMINI_API_KEY/);
  });

});
