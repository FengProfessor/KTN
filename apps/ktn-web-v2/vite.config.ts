import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { createLocalWorkerHarness } from './server/local-worker-middleware.mjs';

function ktnLocalWorkerPlugin() {
  const harness = createLocalWorkerHarness();
  return {
    name: 'ktn-local-worker-bff',
    configureServer(server: { middlewares: { use: (fn: unknown) => void } }) {
      server.middlewares.use((req: unknown, res: unknown, next: unknown) => {
        harness.handleRequest(req, res, next);
      });
    },
    configurePreviewServer(server: { middlewares: { use: (fn: unknown) => void } }) {
      server.middlewares.use((req: unknown, res: unknown, next: unknown) => {
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

