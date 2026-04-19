import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../persistence/supabase.service';

/**
 * The factory function is exported separately so it can be unit-tested
 * without needing to construct a real decorator pipeline.
 */
export function currentUserFactory(
  _data: unknown,
  context: ExecutionContext,
): AuthUser | undefined {
  const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
  return request.user;
}

/**
 * Pulls the authenticated user off the request. Must be used on a handler
 * that has `@UseGuards(JwtGuard)` — otherwise `request.user` is undefined.
 *
 * Usage:
 *   @UseGuards(JwtGuard)
 *   @Post()
 *   create(@CurrentUser() user: AuthUser) { ... }
 */
export const CurrentUser = createParamDecorator(currentUserFactory);
