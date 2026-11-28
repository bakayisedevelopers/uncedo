import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [],
      manifest: {
        id: '/',
        name: 'Uncedo Helpers',
        short_name: 'Helpers',
        description: 'Go online, accept nearby customer service requests, manage your services, and complete verification on Uncedo Helpers.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        launch_handler: {
          client_mode: ['focus-existing', 'auto'],
        },
        handle_links: 'preferred',
        prefer_related_applications: false,
        related_applications: [
          {
            platform: 'webapp',
            url: 'https://bakayise-uncedo-latest-helpers.web.app/manifest.webmanifest',
          },
          {
            platform: 'webapp',
            url: 'https://helpers.bakayise.com/manifest.webmanifest',
          },
        ],
        theme_color: '#0B5D56',
        background_color: '#F6F7F4',
        categories: ['business', 'productivity', 'utilities'],
        icons: [
          {
            src: '/helpers-logo-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/helpers-logo-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/helpers-logo-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        importScripts: ['/sw-notifications.js'],
        globPatterns: ['assets/*.{js,css}', 'manifest.webmanifest'],
        globIgnores: ['**/*.{jpg,jpeg,html}'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'uncedo-helpers-pages-v1',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 24,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'uncedo-helpers-fonts',
              expiration: {
                maxEntries: 16,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|webp)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'uncedo-helpers-images-v2',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    outDir: path.resolve(__dirname, '../helpers/dist'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-firebase': [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
            'firebase/functions',
            'firebase/messaging',
            'firebase/storage',
          ],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
    hmr: false,
  },
});
