import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// האתר יושב ב-https://hitzik1-sys.github.io/scanner-proto/
const BASE = '/scanner-proto/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'הסורק מסמכים של המשפחה',
        short_name: 'סורק',
        lang: 'he',
        dir: 'rtl',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: '#f6f7f9',
        theme_color: '#1f5fbf',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // האב-טיפוס הוא אתר נפרד, לא חלק מהאפליקציה
        globIgnores: ['prototype/**'],
        navigateFallbackDenylist: [/\/prototype\//],
        runtimeCaching: [
          {
            // OpenCV (כ-10MB) נטען פעם אחת ונשמר, כדי שהסריקה תעבוד גם בלי אינטרנט
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@techstark\/opencv-js@/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'opencv',
              expiration: { maxEntries: 2 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
  },
});
