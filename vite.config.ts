// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main.ts', // The entry point of your engine
      name: 'VortexEngine',
      fileName: 'vortex-engine',
      formats: ['iife'] // "Immediately Invoked Function Expression" - perfect for Workers
    },
    outDir: 'dist',
    minify: 'esbuild', // Makes the file small and fast
  }
});
