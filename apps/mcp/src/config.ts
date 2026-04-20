import { homedir } from 'os';
import { join } from 'path';

/**
 * Runtime configuration. Only one env var is required from the user:
 * `MARKET_RESEARCHER_URL` — the deployed web app / API base (http://localhost:3000
 * for local dev, https://... for prod). Supabase URL and anon key are fetched
 * at runtime from `/auth/device/config` so users don't have to configure them
 * twice.
 */

const DEFAULT_URL = 'http://localhost:3000';

export type Config = {
  baseUrl: string;
  sessionFile: string;
};

export function loadConfig(): Config {
  const raw = process.env.MARKET_RESEARCHER_URL?.trim();
  const baseUrl = raw && raw.length > 0 ? raw.replace(/\/+$/, '') : DEFAULT_URL;
  const sessionFile = join(
    homedir(),
    '.claude',
    'market-researcher-mcp',
    'session.json',
  );
  return { baseUrl, sessionFile };
}
