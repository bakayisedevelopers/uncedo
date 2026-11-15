import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../helpers/dist'),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
    hmr: false,
  },
});
