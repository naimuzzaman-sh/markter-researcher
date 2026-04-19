import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../persistence/supabase.service';

const BEARER_PREFIX = 'Bearer ';

/**
 * Verifies a Supabase-issued JWT presented as `Authorization: Bearer <jwt>`.
 * On success, attaches the resolved AuthUser to `request.user` so downstream
 * handlers can read it via the `@CurrentUser()` decorator.
 * Any missing/invalid/expired token → 401 Unauthorized.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: unknown;
    }>();

    // Express lowercases header names, but be case-insensitive for safety.
    const rawHeader =
      request.headers['authorization'] ?? request.headers['Authorization'];
    const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!header || !header.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    const token = header.slice(BEARER_PREFIX.length).trim();
    if (!token) {
      throw new UnauthorizedException('Empty bearer token');
    }

    const user = await this.supabase.getUserFromJwt(token);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    request.user = user;
    return true;
  }
}
