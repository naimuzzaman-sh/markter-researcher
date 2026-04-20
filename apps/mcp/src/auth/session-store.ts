import { mkdir, readFile, writeFile, chmod } from 'fs/promises';
import { dirname } from 'path';

/**
 * Shape persisted to ~/.claude/market-researcher-mcp/session.json.
 *
 * `accessToken` is a short-lived Supabase JWT — refreshed transparently
 * via POST /auth/refresh on the backend when near expiry. We don't cache
 * Supabase URL / anon key here because the MCP is HTTP-only and never
 * talks to Supabase directly.
 */
export type Session = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  /** Unix seconds at which accessToken expires. Matches Supabase session shape. */
  expiresAt: number;
};

export async function readSession(path: string): Promise<Session | null> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (
      typeof parsed.userId !== 'string' ||
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.refreshToken !== 'string' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null;
    }
    return parsed as Session;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export async function writeSession(
  path: string,
  session: Session,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(session, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  // writeFile mode is only honoured on file CREATION — re-chmod so rewrites
  // preserve the tight perms too.
  await chmod(path, 0o600);
}
