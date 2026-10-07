import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// `npm run dev:api` serves the API (wrangler pages dev) here.
const API_ORIGIN = 'http://127.0.0.1:8788';

// The teacher app (/admin/) and the student app (/u/) are single-page apps. In
// dev, every page request under them gets their index.html, the same as
// public/_redirects does on Pages.
const APPS = ['/admin', '/u'];

function appFallback(): Plugin {
  return {
    name: 'quickeval-app-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? '';
        const app = APPS.find((base) => path === base || (path.startsWith(`${base}/`) && !path.includes('.')));
        if (app) req.url = `${app}/index.html`;
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), appFallback()],
  appType: 'mpa',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: page('./index.html'),
        admin: page('./admin/index.html'),
        upload: page('./u/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: API_ORIGIN,
        // Keep the browser's Host header. The API then sees the page's own
        // origin (localhost:5173) and accepts its writes (sameOriginWrites).
        changeOrigin: false,
      },
    },
  },
});
