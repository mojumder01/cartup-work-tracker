import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const gitRepo = () => {
  try {
    const url = execSync('git remote get-url origin', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return url.match(/github\.com[/:]([^/]+\/[^/.]+)/)?.[1] ?? '';
  } catch {
    return '';
  }
};
const gitSha = () => {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};
// Shown in the sidebar and on Settings so you can confirm which build is live.
const build = {
  version: pkg.version,
  commit: (process.env.GITHUB_SHA || gitSha()).slice(0, 7),
  run: process.env.GITHUB_RUN_NUMBER || '',
  builtAt: new Date().toISOString(),
  repo: process.env.GITHUB_REPOSITORY || gitRepo(),
};

// Relative base: the built site works under https://<user>.github.io/<repo>/
// (and any other sub-path) without knowing the repository name.
export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __BUILD_INFO__: JSON.stringify(build) },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      // Two pages: the dashboard and the lightweight task update form.
      input: { main: 'index.html', form: 'form.html', assign: 'assign.html' },
      output: {
        manualChunks: {
          charts: ['recharts'],
        },
      },
    },
  },
});
