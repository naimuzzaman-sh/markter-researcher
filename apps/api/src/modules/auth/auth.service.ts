import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { SupabaseService } from '../persistence/supabase.service';

/*
 * =============================================================================
 * AuthService
 *
 * Owns two related concerns:
 *   1. Refresh-token exchange (delegates to SupabaseService).
 *   2. Device-authorization grant for the MCP — in-memory state + transitions
 *      for start / poll / authorize / deny.
 *
 * Device-flow state is process-local and non-durable — a server restart
 * invalidates in-flight device codes but does NOT revoke MCP sessions already
 * issued (those live in ~/.claude/market-researcher-mcp/session.json on the
 * client).
 *
 * Errors thrown by this service are plain `Error`s with descriptive messages;
 * the controller maps them to HTTP status codes. Keeping HTTP concerns out of
 * the service lets us unit-test the state machine cleanly with fake timers.
 * =============================================================================
 */

const DEVICE_CODE_BYTES = 32;
const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // skip I/O/0/1 for legibility
const USER_CODE_SEGMENTS = 2;
const USER_CODE_SEGMENT_LEN = 4;
const POLL_INTERVAL_SECS = 2;
const EXPIRES_IN_SECS = 600;

type PendingDevice = {
  status: 'pending';
  deviceCode: string;
  userCode: string;
  expiresAt: number; // epoch ms
  lastPolledAt: number | null;
};

type AuthorizedDevice = {
  status: 'authorized';
  deviceCode: string;
  userCode: string;
  expiresAt: number;
  lastPolledAt: number | null;
  userId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number; // epoch seconds (matches Supabase session shape)
};

type DeniedDevice = {
  status: 'denied';
  deviceCode: string;
  userCode: string;
  expiresAt: number;
  lastPolledAt: number | null;
};

type DeviceState = PendingDevice | AuthorizedDevice | DeniedDevice;

export type RefreshResult = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
};

export type StartDeviceResult = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  pollInterval: number;
  expiresIn: number;
};

export type PollDeviceResult =
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

export type AuthorizeDeviceInput = {
  userCode: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
};

function generateUserCode(): string {
  const segs: string[] = [];
  for (let s = 0; s < USER_CODE_SEGMENTS; s++) {
    let segment = '';
    const bytes = randomBytes(USER_CODE_SEGMENT_LEN);
    for (let i = 0; i < USER_CODE_SEGMENT_LEN; i++) {
      segment += USER_CODE_ALPHABET[bytes[i] % USER_CODE_ALPHABET.length];
    }
    segs.push(segment);
  }
  return segs.join('-');
}

function generateDeviceCode(): string {
  return randomBytes(DEVICE_CODE_BYTES).toString('hex');
}

@Injectable()
export class AuthService {
  // Keyed by deviceCode (what the MCP sends on poll).
  private readonly byDevice = new Map<string, DeviceState>();
  // Reverse index: userCode → deviceCode (what the browser sends on authorize).
  private readonly byUserCode = new Map<string, string>();

  constructor(private readonly supabase: SupabaseService) {}

  // --- Refresh --------------------------------------------------------------

  async refresh(refreshToken: string): Promise<RefreshResult | null> {
    return this.supabase.refreshSession(refreshToken);
  }

  // --- Device flow ----------------------------------------------------------

  startDevice(verificationUriBase: string): StartDeviceResult {
    // Retry generation a few times on collision (vanishingly rare given
    // 256-bit deviceCodes and 32-bit userCodes).
    let userCode = generateUserCode();
    for (let i = 0; i < 5 && this.byUserCode.has(userCode); i++) {
      userCode = generateUserCode();
    }
    if (this.byUserCode.has(userCode)) {
      throw new Error('Failed to allocate unique userCode');
    }

    let deviceCode = generateDeviceCode();
    for (let i = 0; i < 5 && this.byDevice.has(deviceCode); i++) {
      deviceCode = generateDeviceCode();
    }
    if (this.byDevice.has(deviceCode)) {
      throw new Error('Failed to allocate unique deviceCode');
    }

    const state: PendingDevice = {
      status: 'pending',
      deviceCode,
      userCode,
      expiresAt: Date.now() + EXPIRES_IN_SECS * 1000,
      lastPolledAt: null,
    };
    this.byDevice.set(deviceCode, state);
    this.byUserCode.set(userCode, deviceCode);

    return {
      deviceCode,
      userCode,
      verificationUri: `${verificationUriBase.replace(/\/+$/, '')}/authorize/${userCode}`,
      pollInterval: POLL_INTERVAL_SECS,
      expiresIn: EXPIRES_IN_SECS,
    };
  }

  pollDevice(deviceCode: string): PollDeviceResult {
    const state = this.byDevice.get(deviceCode);
    if (!state) {
      // Unknown OR already consumed OR GC'd — collapse to "expired" so an
      // attacker can't distinguish "never existed" from "already used".
      return { status: 'expired' };
    }

    const now = Date.now();
    if (now >= state.expiresAt) {
      this.evict(state);
      return { status: 'expired' };
    }

    if (
      state.lastPolledAt !== null &&
      now - state.lastPolledAt < POLL_INTERVAL_SECS * 1000
    ) {
      // Don't update lastPolledAt on slow_down — otherwise a fast poller
      // could extend the cooldown indefinitely.
      return { status: 'slow_down' };
    }
    state.lastPolledAt = now;

    if (state.status === 'pending') {
      return { status: 'pending' };
    }

    if (state.status === 'denied') {
      this.evict(state);
      return { status: 'denied' };
    }

    // authorized → hand tokens to the MCP and consume the entry.
    const payload: PollDeviceResult = {
      status: 'authorized',
      accessToken: state.accessToken,
      refreshToken: state.refreshToken,
      userId: state.userId,
      expiresAt: state.tokenExpiresAt,
    };
    this.evict(state);
    return payload;
  }

  authorizeDevice(input: AuthorizeDeviceInput): void {
    const state = this.takePendingByUserCode(input.userCode);
    this.byDevice.set(state.deviceCode, {
      ...state,
      status: 'authorized',
      userId: input.userId,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      tokenExpiresAt: input.tokenExpiresAt,
    });
  }

  denyDevice(userCode: string): void {
    const state = this.takePendingByUserCode(userCode);
    this.byDevice.set(state.deviceCode, { ...state, status: 'denied' });
  }

  // --- Internal helpers -----------------------------------------------------

  private takePendingByUserCode(userCode: string): PendingDevice {
    const deviceCode = this.byUserCode.get(userCode);
    const state = deviceCode ? this.byDevice.get(deviceCode) : undefined;
    if (!state) {
      throw new Error('userCode is invalid or expired');
    }
    if (Date.now() >= state.expiresAt) {
      this.evict(state);
      throw new Error('userCode is invalid or expired');
    }
    if (state.status !== 'pending') {
      throw new Error('userCode is invalid or expired (already used)');
    }
    return state;
  }

  private evict(state: DeviceState): void {
    this.byDevice.delete(state.deviceCode);
    this.byUserCode.delete(state.userCode);
  }
}
