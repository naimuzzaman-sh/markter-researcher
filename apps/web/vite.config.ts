import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// Every API path prefix on the server side. One source of truth — add a
// new route here and the dev proxy picks it up without hand-wiring.
const API_PATHS = [
  '/auth',
  '/briefs',
  '/calls',
  '/chat',
  '/health',
  '/interviews',
  '/mcp',
  '/webhooks',
] as const;

export default defineConfig(({ mode }) => {
  // Pull env from the monorepo root .env so the web app doesn't need a
  // duplicate. VITE_* keys leak into the client bundle; others stay
  // server-side-only (e.g. VITE_DEV_API_TARGET for the dev proxy).
  const envDir = path.resolve(__dirname, '../..');
  const env = loadEnv(mode, envDir, '');

  // Dev proxy target: env override → else local server default. In prod
  // the SPA hits the server directly via VITE_API_BASE_URL; this proxy
  // only matters when the browser makes same-origin fetches against the
  // Vite dev server.
  const apiTarget =
    env.VITE_DEV_API_TARGET ?? env.VITE_API_BASE_URL ?? 'http://localhost:3001';

  // Common proxy shape for every API path. `bypass` returns index.html
  // for HTML navigations so client-side routes (/assistant, /briefs/:id,
  // …) that happen to share a prefix with an API path don't get
  // swallowed by the proxy and 404'd by the JSON API.
  const proxyEntry = {
    target: apiTarget,
    changeOrigin: true,
    bypass: (req: { headers: { accept?: string } }) =>
      req.headers.accept?.includes('text/html') ? '/index.html' : undefined,
  };

  return {
    plugins: [react(), tailwindcss()],
    envDir,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: Object.fromEntries(API_PATHS.map((p) => [p, proxyEntry])),
    },
  };
});
