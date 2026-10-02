import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config';

/**
 * Build an anon-key Supabase client. Per-request user scoping is applied at
 * the service layer via `owner_id = ctx.userId` filters. A user-JWT client
 * for direct RLS scoping can be added later (see `createUserSupabaseClient`
 * once RLS is enabled in the migrations).
 */
export function createSupabaseClient(cfg: Config): SupabaseClient {
  return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: false },
  });
}
