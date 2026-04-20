import { type Session, readSession, writeSession } from './session-store.js';

/**
 * Device-authorization grant client for the Market Researcher API.
 *
 * Flow:
 *   - First tool call with no cached session:
 *       POST /auth/device/start → remember deviceCode + verificationUri →
 *       throw PendingAuthError carrying the URL. The tool layer catches
 *       that error and returns the URL to Claude as its response, which
 *       surfaces it to the user.
 *   - Subsequent tool calls while we're still pending:
 *       GET /auth/device/poll → if authorized, save the session and let
 *       the tool call proceed; otherwise throw PendingAuthError again.
 *   - Warm starts with a cached session near expiry:
 *       POST /auth/refresh to rotate tokens in place.
 *
 * This means a first-time tool call returns *quickly* with instructions to
 * authorize, rather than silently blocking inside the MCP process — Claude
 * Code doesn't surface routine server stderr, so a stderr-only URL is
 * invisible to the user.
 */

type StartResponse = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  pollInterval: number;
  expiresIn: number;
};

type PollResponse =
  | { status: 'pending' }
  | { status: 'slow_down' }
  | { status: 'denied' }
  | { status: 'expired' }
  | {
      status: 'authorized';
      accessToken: string;
      refreshToken: string;
      userId: string;
      expiresAt: number;
    };

type RefreshResponse = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
};

/** Small buffer so we refresh slightly before the server considers us expired. */
const REFRESH_LEEWAY_SECS = 60;

/**
 * Thrown from `DeviceAuth.ensureSession` when no valid session is available
 * and the user hasn't completed the browser authorize step yet. The `message`
 * is what Claude Code will display to the user (via the tool layer catching
 * this and returning it as text content).
 */
export class PendingAuthError extends Error {
  constructor(
    public readonly verificationUri: string,
    public readonly userCode: string,
  ) {
    super(
      `Authorization required. Open this URL in your browser (signed in to the web app) and click Authorize, then retry this tool:\n\n    ${verificationUri}\n\n(Verification code: ${userCode})`,
    );
    this.name = 'PendingAuthError';
  }
}

type PendingDevice = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAtMs: number;
};

function log(msg: string): void {
  // stderr is safe — stdout is reserved for MCP protocol frames. We still log
  // here for visibility when running `pnpm --filter mcp dev` by hand, but the
  // PRIMARY surface is PendingAuthError propagated up to the tool layer.
  process.stderr.write(`[market-researcher-mcp] ${msg}\n`);
}

export class DeviceAuth {
  private cached: Session | null = null;
  private pending: PendingDevice | null = null;
  /** Single-flight guard so concurrent tool calls share the same auth attempt. */
  private inFlight: Promise<Session> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly sessionFile: string,
  ) {}

  /**
   * Returns a valid Session, or throws PendingAuthError if the user needs
   * to complete a browser authorize step.
   */
  async ensureSession(): Promise<Session> {
    if (
      this.cached &&
      this.cached.expiresAt - REFRESH_LEEWAY_SECS >
        Math.floor(Date.now() / 1000)
    ) {
      return this.cached;
    }
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.resolveSession().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Convenience for callers that only need the bearer token. */
  async getAccessToken(): Promise<string> {
    return (await this.ensureSession()).accessToken;
  }

  private async resolveSession(): Promise<Session> {
    // 1. Disk-cached session → try refresh if near expiry, otherwise use as-is.
    const disk = this.cached ?? (await readSession(this.sessionFile));
    if (disk) {
      const nowSecs = Math.floor(Date.now() / 1000);
      if (disk.expiresAt - REFRESH_LEEWAY_SECS > nowSecs) {
        this.cached = disk;
        return disk;
      }
      const refreshed = await this.refresh(disk);
      if (refreshed) {
        this.cached = refreshed;
        return refreshed;
      }
      // Refresh failed → fall through to device flow.
    }

    // 2. Pending device flow already in progress? Poll once.
    if (this.pending && this.pending.expiresAtMs > Date.now()) {
      const poll = await this.pollOnce(this.pending.deviceCode);
      if (poll.status === 'authorized') {
        const session: Session = {
          userId: poll.userId,
          accessToken: poll.accessToken,
          refreshToken: poll.refreshToken,
          expiresAt: poll.expiresAt,
        };
        await writeSession(this.sessionFile, session);
        this.cached = session;
        this.pending = null;
        log('Authorized. Session cached.');
        return session;
      }
      if (poll.status === 'denied') {
        this.pending = null;
        throw new Error('Authorization was denied.');
      }
      if (poll.status === 'expired') {
        this.pending = null;
        // Fall through to start a new flow.
      } else {
        // pending | slow_down → tell the user (again) where to go.
        throw new PendingAuthError(
          this.pending.verificationUri,
          this.pending.userCode,
        );
      }
    } else if (this.pending) {
      this.pending = null; // stale
    }

    // 3. Kick off a fresh device flow.
    const start = await this.fetchJson<StartResponse>(
      'POST',
      '/auth/device/start',
    );
    this.pending = {
      deviceCode: start.deviceCode,
      userCode: start.userCode,
      verificationUri: start.verificationUri,
      expiresAtMs: Date.now() + start.expiresIn * 1000,
    };
    log(`Authorization required: ${start.verificationUri}`);
    throw new PendingAuthError(start.verificationUri, start.userCode);
  }

  private async refresh(session: Session): Promise<Session | null> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      if (!response.ok) {
        log(`Refresh failed (HTTP ${response.status}) — re-authorizing.`);
        return null;
      }
      const body = (await response.json()) as RefreshResponse;
      const next: Session = {
        userId: body.userId,
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
        expiresAt: body.expiresAt,
      };
      await writeSession(this.sessionFile, next);
      return next;
    } catch (err) {
      log(
        `Refresh threw: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private async pollOnce(deviceCode: string): Promise<PollResponse> {
    const response = await fetch(
      `${this.baseUrl}/auth/device/poll?deviceCode=${encodeURIComponent(deviceCode)}`,
    );
    if (response.status === 429) {
      // slow_down — surface as "still pending" to the caller
      return { status: 'slow_down' };
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `GET /auth/device/poll → HTTP ${response.status}${text ? `: ${text}` : ''}`,
      );
    }
    return (await response.json()) as PollResponse;
  }

  private async fetchJson<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `${method} ${path} → HTTP ${response.status}${text ? `: ${text}` : ''}`,
      );
    }
    return response.json() as Promise<T>;
  }
}
