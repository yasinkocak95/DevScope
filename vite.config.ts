import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        devtools: resolve(rootDir, 'devtools.html'),
        panel: resolve(rootDir, 'panel.html'),
        background: resolve(rootDir, 'src/background/index.ts'),
        relay: resolve(rootDir, 'src/content/relay.ts'),
        floatingLoader: resolve(rootDir, 'src/content/floatingLoader.ts'),
        floatingUi: resolve(rootDir, 'src/content/floatingUi.tsx'),
        pageHook: resolve(rootDir, 'src/content/pageHook.ts')
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
