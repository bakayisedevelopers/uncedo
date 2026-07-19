import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared-rewards': path.resolve(__dirname, '../shared/rewards/index.js'),
    },
  },
});
