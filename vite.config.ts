import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages project sites are served from /<repo>/. Override with VITE_BASE
// (for example VITE_BASE=/ for a user or organisation site).
const base = process.env.VITE_BASE ?? '/watersort/'

// Port must never be 8080. 5173 is the Vite default; set strictPort: false so
// Vite picks the next free port instead of failing when it is busy.
const port = 5173

export default defineConfig({
  base,
  server: { port, strictPort: false },
  preview: { port, strictPort: false },
  build: { target: 'es2022' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'WaterSort',
        short_name: 'WaterSort',
        description: 'A water-sorting puzzle game.',
        theme_color: '#0b1020',
        background_color: '#0b1020',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
    }),
  ],
})
