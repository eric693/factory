import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/wo\/.+\/qr-data/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'qr-data', expiration: { maxEntries: 50, maxAgeSeconds: 3600 } },
          },
        ],
      },
      manifest: {
        name: 'FactoryOS 生產管理',
        short_name: 'FactoryOS',
        description: '工廠生產排程與管理系統',
        theme_color: '#0e3a6e',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 5174,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:5100', changeOrigin: true },
    },
  },
})
