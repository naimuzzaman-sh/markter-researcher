import type { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config';

/**
 * Context passed to every tool. Minimal by design — adds fields only when a
 * tool actually needs them. `userId` is always present (all tools run under
 * an authenticated user). `supabase` + `config` let tools reach DB and
 * external APIs without re-deriving them.
 */
export type ToolCtx = {
  userId: string;
  /**
   * Researcher's email — pulled from the JWT user object on each
   * request. Optional because phone-based / magic-link auth flows
   * may not surface one. Used as the Reply-To header on outbound
   * invite emails so candidates can respond directly to the human
   * who's running the research.
   */
  userEmail: string | null;
  supabase: SupabaseClient;
  config: Config;
};

export interface Tool<
  Args extends Record<string, unknown> = Record<string, unknown>,
  Result = unknown,
> {
  name: string;
  description: string;
  inputSchema: z.ZodType<Args>;
  execute(args: Args, ctx: ToolCtx): Promise<Result>;
}

export type ToolRegistry = Record<string, Tool>;
