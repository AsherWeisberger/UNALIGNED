import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [react({ include: /\.(jsx|js|tsx|ts)$/ })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: path.resolve(root, 'flow-v4/main.jsx'),
      output: {
        entryFileNames: 'assets/app.[hash].js',
        chunkFileNames: 'assets/chunk.[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
      },
    },
  },
  server: {
    port: 4173,
    open: '/index.html',
  },
});
