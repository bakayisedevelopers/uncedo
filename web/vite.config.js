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
      '/delete-payment-method': {
        target: functionsEmulatorTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/delete-payment-method/, '/deletePaymentMethod'),
      },
      '/verify-tutor-payout-account': {
        target: functionsEmulatorTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/verify-tutor-payout-account/, '/verifyTutorPayoutAccount'),
      },
      '/list-tutor-payout-banks': {
        target: functionsEmulatorTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/list-tutor-payout-banks/, '/listTutorPayoutBanks'),
      },
      '/pricing-quote': {
        target: functionsEmulatorTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pricing-quote/, '/getPricingQuote'),
      },
      '/sync-student-growth': {
        target: functionsEmulatorTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sync-student-growth/, '/syncStudentGrowth'),
      },
      '/image-ocr': {
        target: functionsEmulatorTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/image-ocr/, '/extractImageOcr'),
      },
      '/classify-subject': {
        target: functionsEmulatorTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/classify-subject/, '/classifySubject'),
      },
      '/extract-attachment-ai': {
        target: functionsEmulatorTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/extract-attachment-ai/, '/extractAttachmentAi'),
      },
      '/stream-board-extraction': {
        target: functionsEmulatorTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/stream-board-extraction/, '/streamAttachmentAi'),
      },
    },
  },
})
