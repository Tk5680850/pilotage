import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: PILOTAGE_API=http://127.0.0.1:4991 VITE_PORT=5241 npx vite  → a dev UI against a copy server.
const api = process.env.PILOTAGE_API || 'http://127.0.0.1:4747';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 900 },
  server: { port: Number(process.env.VITE_PORT) || 5199, strictPort: true, proxy: { '/api': api, '/auth': api } },
});
