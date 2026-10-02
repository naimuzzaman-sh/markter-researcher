import { describe, it, expect } from 'vitest';
import { AppError, httpStatusFor, toErrorBody } from './errors';

describe('AppError', () => {
  it('captures code + message + cause', () => {
    const cause = new Error('root');
    const err = new AppError('not_found', 'brief missing', { cause });
    expect(err.code).toBe('not_found');
    expect(err.message).toBe('brief missing');
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('AppError');
  });
});

describe('httpStatusFor', () => {
  it.each([
    ['unauthorized', 401],
    ['forbidden', 403],
    ['not_found', 404],
    ['validation', 400],
    ['conflict', 409],
    ['upstream', 502],
    ['internal', 500],
  ])('maps %s → %i', (code, status) => {
    expect(httpStatusFor(code as never)).toBe(status);
  });

  it('unknown code falls back to 500', () => {
    expect(httpStatusFor('weird' as never)).toBe(500);
  });
});

describe('toErrorBody', () => {
  it('formats an AppError into wire shape', () => {
    const body = toErrorBody(new AppError('not_found', 'brief missing'));
    expect(body).toEqual({ error: 'not_found', message: 'brief missing' });
  });

  it('wraps an unknown error as internal', () => {
    const body = toErrorBody(new Error('boom'));
    expect(body.error).toBe('internal');
    expect(body.message).toBe('Internal error');
  });
});
