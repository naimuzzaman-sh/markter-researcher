import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { AppError } from '../lib/errors';
import { errorHandler } from './error-handler';

function makeApp() {
  const app = new Hono();
  app.onError(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('maps AppError to its HTTP status + JSON body', async () => {
    const app = makeApp();
    app.get('/x', () => {
      throw new AppError('not_found', 'brief missing');
    });
    const res = await app.request('/x');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: 'not_found',
      message: 'brief missing',
    });
  });

  it('maps validation errors to 400', async () => {
    const app = makeApp();
    app.get('/v', () => {
      throw new AppError('validation', 'bad input');
    });
    const res = await app.request('/v');
    expect(res.status).toBe(400);
  });

  it('wraps unknown errors as 500 internal without leaking details', async () => {
    const app = makeApp();
    app.get('/boom', () => {
      throw new Error('supabase connection lost, password=hunter2');
    });
    const res = await app.request('/boom');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'internal', message: 'Internal error' });
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });
});
