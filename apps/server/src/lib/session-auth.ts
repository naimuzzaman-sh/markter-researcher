import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeviceFlow } from './device-flow';

/**
 * Per-MCP-session auth cache — same role as the old `DeviceAuth` class in
 * `apps/mcp`, but keyed by `Mcp-Session-Id` instead of one-per-process.
 *
 * State machine (unchanged from apps/mcp):
 *   unauth ──start()──▶ pending ──user approves in browser──▶ authorized
 *   pending ──still pending on retry──▶ return same URL
 *   authorized ──near expiry──▶ refresh ──▶ authorized
 *   authorized ──refresh fails──▶ unauth (re-auth)
 *
 * In-memory, per-instance. Multi-instance deploys → swap for Redis.
 */

const REFRESH_LEEWAY_SECS = 60;

type SessionAuth =
  | { kind: 'unauth' }
  | {
      kind: 'pending';
      deviceCode: string;
      userCode: string;
      verificationUri: string;
      expiresAtMs: number;
    }
  | {
      kind: 'authorized';
      userId: string;
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
    };

export type ResolvedAuth =
  | { kind: 'authorized'; userId: string; accessToken: string }
  | { kind: 'pending'; verificationUri: string; userCode: string }
  | { kind: 'denied' };

export class SessionAuthStore {
  private readonly bySession = new Map<string, SessionAuth>();
  private readonly inFlight = new Map<string, Promise<ResolvedAuth>>();

  constructor(
    private readonly device: DeviceFlow,
    private readonly supabase: SupabaseClient,
  ) {}

  resolve(sessionId: string, webBase: string): Promise<ResolvedAuth> {
    const existing = this.inFlight.get(sessionId);
    if (existing) return existing;
    const p = this.resolveInner(sessionId, webBase).finally(() => {
      this.inFlight.delete(sessionId);
    });
    this.inFlight.set(sessionId, p);
    return p;
  }

  forget(sessionId: string): void {
    this.bySession.delete(sessionId);
    this.inFlight.delete(sessionId);
  }

  private async resolveInner(
    sessionId: string,
    webBase: string,
  ): Promise<ResolvedAuth> {
    const state = this.bySession.get(sessionId) ?? { kind: 'unauth' };

    if (state.kind === 'authorized') {
      const nowSecs = Math.floor(Date.now() / 1000);
      if (state.expiresAt - REFRESH_LEEWAY_SECS > nowSecs) {
        return { kind: 'authorized', userId: state.userId, accessToken: state.accessToken };
      }
      const refreshed = await this.refresh(state.refreshToken);
      if (refreshed) {
        this.bySession.set(sessionId, { kind: 'authorized', ...refreshed });
        return { kind: 'authorized', userId: refreshed.userId, accessToken: refreshed.accessToken };
      }
      this.bySession.set(sessionId, { kind: 'unauth' });
    }

    if (state.kind === 'pending') {
      if (state.expiresAtMs <= Date.now()) {
        this.bySession.delete(sessionId);
      } else {
        const poll = this.device.poll(state.deviceCode);
        if (poll.status === 'authorized') {
          this.bySession.set(sessionId, {
            kind: 'authorized',
            userId: poll.userId,
            accessToken: poll.accessToken,
            refreshToken: poll.refreshToken,
            expiresAt: poll.expiresAt,
          });
          return { kind: 'authorized', userId: poll.userId, accessToken: poll.accessToken };
        }
        if (poll.status === 'denied') {
          this.bySession.delete(sessionId);
          return { kind: 'denied' };
        }
        if (poll.status === 'pending' || poll.status === 'slow_down') {
          return {
            kind: 'pending',
            verificationUri: state.verificationUri,
            userCode: state.userCode,
          };
        }
        // expired → start fresh below
        this.bySession.delete(sessionId);
      }
    }

    const started = this.device.start(webBase);
    this.bySession.set(sessionId, {
      kind: 'pending',
      deviceCode: started.deviceCode,
      userCode: started.userCode,
      verificationUri: started.verificationUri,
      expiresAtMs: Date.now() + started.expiresIn * 1000,
    });
    return {
      kind: 'pending',
      verificationUri: started.verificationUri,
      userCode: started.userCode,
    };
  }

  private async refresh(refreshToken: string): Promise<{
    userId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  } | null> {
    try {
      const { data, error } = await this.supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });
      if (error || !data?.session) return null;
      return {
        userId: data.session.user.id,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      };
    } catch {
      return null;
    }
  }
}
