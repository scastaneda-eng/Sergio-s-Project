import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves this app from /Sergio-Slack-Template-Generator/, so all
// asset URLs need that prefix. Update the string if the repo is ever renamed.
export default defineConfig({
  plugins: [react()],
  base: '/Sergio-Slack-Template-Generator/',
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
  },
});
