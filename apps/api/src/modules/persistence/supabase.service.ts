import { Injectable, Logger } from '@nestjs/common';
import {
  SupabaseService as Core,
  type AuthUser,
} from '@market-researcher/shared';

export type { AuthUser };

/**
 * Nest-injectable wrapper around the shared `SupabaseService`. All actual
 * Supabase query logic lives in `@market-researcher/shared`. This class only
 * exists so Nest's DI tree stays intact: factory-injected with the url/anon
 * key in `persistence.module.ts`.
 */
@Injectable()
export class SupabaseService extends Core {
  constructor(url: string, anonKey: string) {
    const logger = new Logger(SupabaseService.name);
    super(url, anonKey, {
      warn: (m) => logger.warn(m),
      error: (m, s) => logger.error(m, s),
    });
  }
}
