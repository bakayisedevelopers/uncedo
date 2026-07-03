import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const functionsEmulatorTarget = 'http://localhost:5001/parakleo/us-central1'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ice-config': {
        target: functionsEmulatorTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ice-config/, '/getIceConfig'),
      },
      '/verify-paystack': {
        target: functionsEmulatorTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/verify-paystack/, '/verifyPaystack'),
      },
      '/finalize-session-billing': {
        target: functionsEmulatorTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/finalize-session-billing/, '/finalizeSessionBilling'),
      },
    },
  },
})
