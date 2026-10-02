import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { AppError } from './errors';

/**
 * Device-authorization flow + per-MCP-session token cache.
 * Combines what used to be `DeviceFlow` + `SessionAuthStore` into a single
 * module of plain functions. All state is module-level — one server process
 * = one flow tracker. For multi-instance deploys, swap the Maps for Redis.
 *
 * Flow (mirrors the old apps/mcp UX, push-based — no polling):
 *   unauth ──resolveAuth()──▶ pending (returns URL)
 *   user approves in browser ──approveByUserCode()──▶ authorized + wakes waiters
 *   tool call retry ──waitForAuth() resolves instantly──▶ tokens returned
 *   authorized, token near expiry ──resolveAuth() refreshes──▶ authorized
 */

const REFRESH_LEEWAY_SECS = 60;
const EXPIRES_IN_SECS = 600;
const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
const USER_CODE_SEGMENTS = 2;
const USER_CODE_SEGMENT_LEN = 4;

type Authorized = {
  kind: 'authorized';
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type Terminal = Authorized | { kind: 'denied' };

type Pending = {
  kind: 'pending';
  userCode: string;
  verificationUri: string;
  expiresAtMs: number;
  waiters: Array<(r: Terminal) => void>;
};

type SessionState = Pending | Authorized;

export type ResolvedAuth =
  | { kind: 'authorized'; userId: string; accessToken: string }
  | { kind: 'pending'; verificationUri: string; userCode: string }
  | { kind: 'denied' };

// --- module state -----------------------------------------------------------

const sessions = new Map<string, SessionState>();
const byUserCode = new Map<string, string>(); // userCode → sessionId

// --- public API -------------------------------------------------------------

/**
 * Resolve auth for a tool call. Never blocks; either returns authorized
 * tokens, or returns a pending URL for the user to open. For push-based
 * "wait until approved" semantics, call `waitForAuth()` after this.
 */
export async function resolveAuth(
  sessionId: string,
  webBase: string,
  supabase: SupabaseClient,
): Promise<ResolvedAuth> {
  const state = sessions.get(sessionId);

  if (state?.kind === 'authorized') {
    if (state.expiresAt - REFRESH_LEEWAY_SECS > nowSecs()) {
      return { kind: 'authorized', userId: state.userId, accessToken: state.accessToken };
    }
    const refreshed = await refresh(supabase, state.refreshToken);
    if (refreshed) {
      sessions.set(sessionId, { kind: 'authorized', ...refreshed });
      return {
        kind: 'authorized',
        userId: refreshed.userId,
        accessToken: refreshed.accessToken,
      };
    }
    sessions.delete(sessionId);
  }

  if (state?.kind === 'pending' && state.expiresAtMs > Date.now()) {
    return {
      kind: 'pending',
      verificationUri: state.verificationUri,
      userCode: state.userCode,
    };
  }

  // Evict stale pending + start fresh
  if (state?.kind === 'pending') {
    byUserCode.delete(state.userCode);
    sessions.delete(sessionId);
  }

  const userCode = uniqueUserCode();
  const verificationUri = `${webBase.replace(/\/+$/, '')}/authorize/${userCode}`;
  sessions.set(sessionId, {
    kind: 'pending',
    userCode,
    verificationUri,
    expiresAtMs: Date.now() + EXPIRES_IN_SECS * 1000,
    waiters: [],
  });
  byUserCode.set(userCode, sessionId);
  return { kind: 'pending', verificationUri, userCode };
}

/**
 * Block until the pending flow resolves (authorize / deny) or `timeoutMs`
 * fires. Event-driven — wakes instantly on approve/deny via push, no
 * polling. Returns `pending` when timeout wins.
 */
export function waitForAuth(sessionId: string, timeoutMs: number): Promise<ResolvedAuth> {
  const state = sessions.get(sessionId);
  if (!state) {
    return Promise.resolve({ kind: 'pending', verificationUri: '', userCode: '' });
  }
  if (state.kind === 'authorized') {
    return Promise.resolve({
      kind: 'authorized',
      userId: state.userId,
      accessToken: state.accessToken,
    });
  }

  return new Promise((resolve) => {
    const resolver = (t: Terminal) => {
      clearTimeout(timer);
      if (t.kind === 'authorized') {
        resolve({ kind: 'authorized', userId: t.userId, accessToken: t.accessToken });
      } else {
        resolve({ kind: 'denied' });
      }
    };
    const timer = setTimeout(() => {
      const idx = state.waiters.indexOf(resolver);
      if (idx >= 0) state.waiters.splice(idx, 1);
      resolve({
        kind: 'pending',
        verificationUri: state.verificationUri,
        userCode: state.userCode,
      });
    }, timeoutMs);
    state.waiters.push(resolver);
  });
}

/**
 * Called by the web `/auth/device/authorize` handler when the signed-in
 * user approves a pending request. Flips state → authorized, wakes every
 * waiter on that session.
 */
export function approveByUserCode(
  userCode: string,
  tokens: { userId: string; accessToken: string; refreshToken: string; expiresAt: number },
): void {
  const { state, sessionId } = takePending(userCode);
  const authorized: Authorized = { kind: 'authorized', ...tokens };
  sessions.set(sessionId, authorized);
  byUserCode.delete(userCode);
  for (const w of state.waiters) w(authorized);
}

export function denyByUserCode(userCode: string): void {
  const { state, sessionId } = takePending(userCode);
  sessions.delete(sessionId);
  byUserCode.delete(userCode);
  for (const w of state.waiters) w({ kind: 'denied' });
}

export function forgetSession(sessionId: string): void {
  const state = sessions.get(sessionId);
  if (state?.kind === 'pending') byUserCode.delete(state.userCode);
  sessions.delete(sessionId);
}

/** Test-only: wipe state. Never called in production paths. */
export function _resetForTests(): void {
  sessions.clear();
  byUserCode.clear();
}

// --- internals --------------------------------------------------------------

function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

function takePending(userCode: string): { state: Pending; sessionId: string } {
  const sessionId = byUserCode.get(userCode);
  const state = sessionId ? sessions.get(sessionId) : undefined;
  if (!state || state.kind !== 'pending') {
    throw new AppError('not_found', 'userCode is invalid or expired');
  }
  if (state.expiresAtMs <= Date.now()) {
    sessions.delete(sessionId!);
    byUserCode.delete(userCode);
    throw new AppError('not_found', 'userCode expired');
  }
  return { state, sessionId: sessionId! };
}

function uniqueUserCode(): string {
  for (let i = 0; i < 10; i++) {
    const code = generateUserCode();
    if (!byUserCode.has(code)) return code;
  }
  throw new AppError('internal', 'Could not allocate unique user code');
}

function generateUserCode(): string {
  const segs: string[] = [];
  for (let s = 0; s < USER_CODE_SEGMENTS; s++) {
    const bytes = randomBytes(USER_CODE_SEGMENT_LEN);
    let seg = '';
    for (let i = 0; i < USER_CODE_SEGMENT_LEN; i++) {
      seg += USER_CODE_ALPHABET[bytes[i] % USER_CODE_ALPHABET.length];
    }
    segs.push(seg);
  }
  return segs.join('-');
}

async function refresh(
  supabase: SupabaseClient,
  refreshToken: string,
): Promise<Omit<Authorized, 'kind'> | null> {
  try {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data?.session) return null;
    return {
      userId: data.session.user.id,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at ?? nowSecs() + 3600,
    };
  } catch {
    return null;
  }
}
