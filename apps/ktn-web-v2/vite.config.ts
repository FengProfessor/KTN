import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { createLocalWorkerHarness } from './server/local-worker-middleware.mjs';

const SHAKA_BUNDLE_PATH = path.resolve(
  __dirname,
  './node_modules/shaka-player/dist/shaka-player.compiled-es2021.js'
);

function serveShakaVendorBundle(
  req: { url?: string },
  res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: Buffer) => void }
) {
  if (req.url && req.url.split('?')[0] === '/vendor/shaka-player.compiled-es2021.js' && fs.existsSync(SHAKA_BUNDLE_PATH)) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(fs.readFileSync(SHAKA_BUNDLE_PATH));
    return true;
  }
  return false;
}

function ktnLocalWorkerPlugin() {
  const harness = createLocalWorkerHarness();
  return {
    name: 'ktn-local-worker-bff',
    configureServer(server: { middlewares: { use: (fn: unknown) => void } }) {
      server.middlewares.use((req: { url?: string }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: Buffer) => void }, next: () => void) => {
        if (serveShakaVendorBundle(req, res)) return;
        harness.handleRequest(req, res, next);
      });
    },
    configurePreviewServer(server: { middlewares: { use: (fn: unknown) => void } }) {
      server.middlewares.use((req: { url?: string }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: Buffer) => void }, next: () => void) => {
        if (serveShakaVendorBundle(req, res)) return;
        harness.handleRequest(req, res, next);
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), ktnLocalWorkerPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'hls.js': path.resolve(__dirname, './node_modules/hls.js/dist/hls.light.mjs')
    }
  },
  server: {
    port: 5173,
    host: true
  },
  preview: {
    port: 4173,
    host: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('hubArtAssets')) {
            return 'games-art-hub';
          }
          if (id.includes('zombieArtAssets')) {
            return 'games-art-zombie';
          }
          if (
            id.includes('stageArtAssets') ||
            id.includes('features/games/assets') ||
            id.includes('features\\games\\assets')
          ) {
            return 'games-art-stage';
          }
          if (id.includes('englishVocabularyMap')) {
            return 'games-vocab-en';
          }
          if (
            id.includes('features/games/data') ||
            id.includes('features\\games\\data')
          ) {
            return 'games-vocab';
          }
          if (
            id.includes('features/games/') ||
            id.includes('features\\games\\')
          ) {
            return 'games-ui';
          }
          if (
            id.includes('OrderDetailDrawer') ||
            id.includes('StudentDetailDrawer') ||
            id.includes('TeacherDetailDrawer')
          ) {
            return 'admin-drawers';
          }
          if (
            id.includes('features/chat/') ||
            id.includes('features\\chat\\')
          ) {
            return 'chat-ui';
          }
          if (id.includes('node_modules/hls.js')) {
            return 'vendor-hls';
          }
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/@tanstack') ||
            id.includes('node_modules/zustand')
          ) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          return undefined;
        }
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/unit/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.{ts,tsx}']
  }
});

