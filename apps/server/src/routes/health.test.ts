import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { healthRoute } from './health';

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = new Hono();
    app.route('/', healthRoute);
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
