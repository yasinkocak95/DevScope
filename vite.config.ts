import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const classicContentEntries = new Set([
  resolve(rootDir, 'src/content/pageHook.ts'),
  resolve(rootDir, 'src/content/relay.ts'),
  resolve(rootDir, 'src/content/floatingLoader.ts')
].map((path) => path.replace(/\\/g, '/')));

function classicContentScriptGuard(): Plugin {
  return {
    name: 'devscope-classic-content-script-guard',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk' || !output.facadeModuleId) continue;
        const facade = output.facadeModuleId.replace(/\\/g, '/');
        if (!classicContentEntries.has(facade)) continue;
        if (output.imports.length || output.exports.length) {
          this.error(`${output.fileName} is a classic manifest content script and must not contain static imports or exports.`);
        }
        output.code = `(() => {\n'use strict';\n${output.code}\n})();\n`;
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), classicContentScriptGuard()],
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
