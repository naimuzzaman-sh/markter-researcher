import { describe, it, expect } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { currentUserFactory } from './current-user.decorator';

const buildContext = (user: unknown): ExecutionContext => {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
};

describe('CurrentUser decorator factory', () => {
  it('returns the user attached to the request by JwtGuard', () => {
    const user = { id: 'u1', email: 'a@b.com', phone: null };
    const ctx = buildContext(user);
    expect(currentUserFactory(undefined, ctx)).toEqual(user);
  });

  it('returns undefined when no user is attached (routes without JwtGuard)', () => {
    const ctx = buildContext(undefined);
    expect(currentUserFactory(undefined, ctx)).toBeUndefined();
  });
});
