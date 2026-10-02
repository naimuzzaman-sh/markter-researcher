import { createMiddleware } from 'hono/factory';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../lib/errors';

export type AuthVariables = {
  userId: string;
  /**
   * Email from the JWT's user record. Null for phone-based or
   * magic-link flows that don't carry an email claim. Used downstream
   * as the Reply-To on outbound emails.
   */
  userEmail: string | null;
};

/**
 * Factory so tests (and future multi-tenant setups) can inject their own
 * Supabase client. Validates `Authorization: Bearer <jwt>` via Supabase,
 * stashes `userId` on the request ctx for downstream handlers.
 */
export function createAuthMiddleware(supabase: SupabaseClient) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const header = c.req.header('authorization') ?? c.req.header('Authorization');
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      throw new AppError('unauthorized', 'Missing or malformed Authorization header');
    }
    const token = header.slice(7).trim();
    if (!token) {
      throw new AppError('unauthorized', 'Empty bearer token');
    }

    let userId: string;
    let userEmail: string | null = null;
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        throw new AppError('unauthorized', 'Invalid or expired token');
      }
      userId = data.user.id;
      userEmail = data.user.email ?? null;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('unauthorized', 'Token verification failed', { cause: err });
    }

    c.set('userId', userId);
    c.set('userEmail', userEmail);
    await next();
  });
}
