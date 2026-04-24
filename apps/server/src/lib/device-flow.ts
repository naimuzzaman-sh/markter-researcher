import { randomBytes } from 'node:crypto';
import { AppError } from './errors';

/**
 * OAuth 2.0 Device Authorization Grant (RFC 8628) — in-memory implementation.
 *
 * Use case: an MCP client (Claude Code / Cursor) running on a user's machine
 * needs a Supabase access token. It calls `startDevice()` to get a short
 * user_code + verification URL, prints the URL to the user. The user opens
 * the URL in their browser (while signed in to the web app), confirms the
 * request, and the web sends the Supabase session to the backend via
 * `authorizeDevice()`. The MCP's `pollDevice()` picks up the tokens on
 * its next tick.
 *
 * State is process-local — a server restart invalidates in-flight device
 * codes but does NOT revoke sessions already issued (those live on the
 * client). If we deploy multi-instance, move to Redis.
 */

const DEVICE_CODE_BYTES = 32;
const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // skip I/O/0/1
const USER_CODE_SEGMENTS = 2;
const USER_CODE_SEGMENT_LEN = 4;
const POLL_INTERVAL_SECS = 2;
const EXPIRES_IN_SECS = 600;

type PendingDevice = {
  status: 'pending';
  deviceCode: string;
  userCode: string;
  expiresAt: number;
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
  tokenExpiresAt: number;
};

type DeniedDevice = {
  status: 'denied';
  deviceCode: string;
  userCode: string;
  expiresAt: number;
  lastPolledAt: number | null;
};

type DeviceState = PendingDevice | AuthorizedDevice | DeniedDevice;

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

export class DeviceFlow {
  private readonly byDevice = new Map<string, DeviceState>();
  private readonly byUserCode = new Map<string, string>();

  start(verificationUriBase: string): StartDeviceResult {
    let userCode = generateUserCode();
    for (let i = 0; i < 5 && this.byUserCode.has(userCode); i++) {
      userCode = generateUserCode();
    }
    if (this.byUserCode.has(userCode)) {
      throw new AppError('internal', 'Failed to allocate unique userCode');
    }

    let deviceCode = generateDeviceCode();
    for (let i = 0; i < 5 && this.byDevice.has(deviceCode); i++) {
      deviceCode = generateDeviceCode();
    }
    if (this.byDevice.has(deviceCode)) {
      throw new AppError('internal', 'Failed to allocate unique deviceCode');
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

  poll(deviceCode: string): PollDeviceResult {
    const state = this.byDevice.get(deviceCode);
    if (!state) return { status: 'expired' };

    const now = Date.now();
    if (now >= state.expiresAt) {
      this.evict(state);
      return { status: 'expired' };
    }

    if (
      state.lastPolledAt !== null &&
      now - state.lastPolledAt < POLL_INTERVAL_SECS * 1000
    ) {
      return { status: 'slow_down' };
    }
    state.lastPolledAt = now;

    if (state.status === 'pending') return { status: 'pending' };
    if (state.status === 'denied') {
      this.evict(state);
      return { status: 'denied' };
    }

    // authorized → hand tokens to the MCP and consume.
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

  authorize(input: AuthorizeDeviceInput): void {
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

  deny(userCode: string): void {
    const state = this.takePendingByUserCode(userCode);
    this.byDevice.set(state.deviceCode, { ...state, status: 'denied' });
  }

  private takePendingByUserCode(userCode: string): PendingDevice {
    const deviceCode = this.byUserCode.get(userCode);
    const state = deviceCode ? this.byDevice.get(deviceCode) : undefined;
    if (!state) {
      throw new AppError('not_found', 'userCode is invalid or expired');
    }
    if (Date.now() >= state.expiresAt) {
      this.evict(state);
      throw new AppError('not_found', 'userCode is invalid or expired');
    }
    if (state.status !== 'pending') {
      throw new AppError('conflict', 'userCode already used');
    }
    return state;
  }

  private evict(state: DeviceState): void {
    this.byDevice.delete(state.deviceCode);
    this.byUserCode.delete(state.userCode);
  }
}
