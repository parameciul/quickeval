import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// `npm run dev:api` serves the API (wrangler pages dev) here.
const API_ORIGIN = 'http://127.0.0.1:8788';

// The teacher app is a single-page app under /admin/. In dev, every /admin page
// request gets admin/index.html, the same as public/_redirects does on Pages.
function adminFallback(): Plugin {
  return {
    name: 'quickeval-admin-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? '';
        if (path === '/admin' || (path.startsWith('/admin/') && !path.includes('.'))) {
          req.url = '/admin/index.html';
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), adminFallback()],
  appType: 'mpa',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: page('./index.html'),
        admin: page('./admin/index.html'),
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
