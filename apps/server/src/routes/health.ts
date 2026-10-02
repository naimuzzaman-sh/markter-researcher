import { Hono } from 'hono';

/**
 * Liveness probe. Deliberately cheap — no DB hit. If we ever want a deeper
 * readiness check (supabase reachable, gemini reachable), add /ready as a
 * separate endpoint.
 */
export const healthRoute = new Hono().get('/health', (c) => c.json({ ok: true }));
