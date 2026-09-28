import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the build runs from any static host or subfolder.
  base: './',
  server: { port: 5173 },
  build: {
    target: 'es2022',
    sourcemap: true,
    // PixiJS in its own chunk: the game code stays small and the engine stays cached across
    // updates. Pixi alone is about 575 kB minified (165 kB gzip), hence the higher warning limit.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'pixi', test: /node_modules[\\/]pixi\.js[\\/]/ }] },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
