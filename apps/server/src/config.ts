import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  // Single origin. Used for BOTH the CORS allow-list and generated auth
  // links (MCP verification URL). `.trim()` before length check so a
  // whitespace-only value fails validation instead of silently becoming
  // an empty origin list.
  WEB_ORIGIN: z.string().trim().min(1, "WEB_ORIGIN required"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a URL"),
  SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY required"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY required"),
  EXA_API_KEY: z.string().min(1, "EXA_API_KEY required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY required"),
  ELEVENLABS_API_KEY: z.string().min(1, "ELEVENLABS_API_KEY required"),
  ELEVENLABS_VOICE_ID: z.string().min(1, "ELEVENLABS_VOICE_ID required"),
  ELEVENLABS_WEBHOOK_SECRET: z.string().default(""),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY required"),
  RESEND_FROM_EMAIL: z
    .string()
    .min(1, 'RESEND_FROM_EMAIL required (e.g. "research@yourdomain.com")'),
});

export type Config = {
  port: number;
  nodeEnv: "development" | "test" | "production";
  webOrigins: string[];
  /** Trailing-slash-stripped single origin for generated auth links. */
  webOrigin: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  geminiApiKey: string;
  exaApiKey: string;
  openaiApiKey: string;
  elevenlabsApiKey: string;
  elevenlabsVoiceId: string;
  elevenlabsWebhookSecret: string;
  resendApiKey: string;
  resendFromEmail: string;
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
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid env: ${issues}`);
  }
  const v = parsed.data;
  const webOrigin = v.WEB_ORIGIN.replace(/\/+$/, "");
  return {
    port: v.PORT,
    nodeEnv: v.NODE_ENV,
    webOrigins: [webOrigin],
    webOrigin,
    supabaseUrl: v.SUPABASE_URL,
    supabaseAnonKey: v.SUPABASE_ANON_KEY,
    geminiApiKey: v.GEMINI_API_KEY,
    exaApiKey: v.EXA_API_KEY,
    openaiApiKey: v.OPENAI_API_KEY,
    elevenlabsApiKey: v.ELEVENLABS_API_KEY,
    elevenlabsVoiceId: v.ELEVENLABS_VOICE_ID,
    elevenlabsWebhookSecret: v.ELEVENLABS_WEBHOOK_SECRET,
    resendApiKey: v.RESEND_API_KEY,
    resendFromEmail: v.RESEND_FROM_EMAIL,
  };
}
