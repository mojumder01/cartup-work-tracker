import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base: the built site works under https://<user>.github.io/<repo>/
// (and any other sub-path) without knowing the repository name.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
        },
      },
    },
  },
});
