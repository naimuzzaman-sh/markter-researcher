import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Read env vars from the monorepo root .env so the web app doesn't need a
  // duplicate .env of its own. VITE_* prefixed keys are exposed to client code.
  envDir: path.resolve(__dirname, '../..'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to the NestJS backend. The `bypass` function returns
      // the index.html path for browser navigations (HTML accepts) so that
      // client-side routes like `/setup` and `/briefs/:id` don't get swallowed
      // by the proxy and hit a non-existent GET handler on the API.
      '/calls': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        bypass: (req) =>
          req.headers.accept?.includes('text/html') ? '/index.html' : undefined,
      },
      '/setup': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        bypass: (req) =>
          req.headers.accept?.includes('text/html') ? '/index.html' : undefined,
      },
      '/briefs': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        bypass: (req) =>
          req.headers.accept?.includes('text/html') ? '/index.html' : undefined,
      },
    },
  },
});
