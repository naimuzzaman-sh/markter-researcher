import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WEB_ORIGIN: z.string().min(1, 'WEB_ORIGIN required'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a URL'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY required'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY required'),
  EXA_API_KEY: z.string().min(1, 'EXA_API_KEY required'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY required'),
  ELEVENLABS_API_KEY: z.string().min(1, 'ELEVENLABS_API_KEY required'),
  ELEVENLABS_VOICE_ID: z.string().min(1, 'ELEVENLABS_VOICE_ID required'),
  ELEVENLABS_WEBHOOK_SECRET: z.string().default(''),
});

export type Config = {
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  webOrigins: string[];
  supabaseUrl: string;
  supabaseAnonKey: string;
  geminiApiKey: string;
  exaApiKey: string;
  openaiApiKey: string;
  elevenlabsApiKey: string;
  elevenlabsVoiceId: string;
  elevenlabsWebhookSecret: string;
};

/**
 * Parse + validate env. Throws at boot if anything required is missing or
 * malformed so we never start a half-configured process.
 * Takes env as arg (defaults to process.env) so tests can inject.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid env: ${issues}`);
  }
  const v = parsed.data;
  return {
    port: v.PORT,
    nodeEnv: v.NODE_ENV,
    webOrigins: v.WEB_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
    supabaseUrl: v.SUPABASE_URL,
    supabaseAnonKey: v.SUPABASE_ANON_KEY,
    geminiApiKey: v.GEMINI_API_KEY,
    exaApiKey: v.EXA_API_KEY,
    openaiApiKey: v.OPENAI_API_KEY,
    elevenlabsApiKey: v.ELEVENLABS_API_KEY,
    elevenlabsVoiceId: v.ELEVENLABS_VOICE_ID,
    elevenlabsWebhookSecret: v.ELEVENLABS_WEBHOOK_SECRET,
  };
}
