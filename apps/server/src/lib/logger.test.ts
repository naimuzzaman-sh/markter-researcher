import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from './logger';

describe('createLogger', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
  });
  afterEach(() => stderrSpy.mockRestore());

  it('emits JSON lines with level and message', () => {
    const log = createLogger();
    log.info('hello');
    const output = stderrSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output.trim());
    expect(parsed.level).toBe('info');
    expect(parsed.msg).toBe('hello');
    expect(parsed.ts).toBeTypeOf('string');
  });

  it('includes context from child logger', () => {
    const log = createLogger().child({ requestId: 'r1', userId: 'u1' });
    log.warn('uh oh');
    const parsed = JSON.parse(stderrSpy.mock.calls[0][0] as string);
    expect(parsed.requestId).toBe('r1');
    expect(parsed.userId).toBe('u1');
    expect(parsed.level).toBe('warn');
  });

  it('stringifies error payloads', () => {
    const log = createLogger();
    log.error('boom', { err: new Error('x') });
    const parsed = JSON.parse(stderrSpy.mock.calls[0][0] as string);
    expect(parsed.err).toContain('x');
  });
});
