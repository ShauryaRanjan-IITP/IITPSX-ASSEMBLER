import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the production build can be loaded from disk by Electron.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
