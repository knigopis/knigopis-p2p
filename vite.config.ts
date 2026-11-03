import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    // Архив — тысячи файлов, и он не меняется; следить за ним — зря тратить лимит inotify.
    watch: { ignored: ['**/public/legacy/**', '**/dist/**', '**/.cache/**'] },
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      // Регистрация — из src/main.tsx (virtual:pwa-register): только так страница
      // сама перезагружается, когда подхватила новую версию.
      injectRegister: false,
      manifest: {
        name: 'Книгопись',
        short_name: 'Книгопись',
        description: 'Дневник читателя: список прочитанных книг',
        lang: 'ru',
        start_url: '/',
        display: 'standalone',
        theme_color: '#3a3f44',
        background_color: '#ffffff',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Новая версия включается сразу, без ожидания, пока закроют все вкладки сайта.
        // Плагин ставит это сам только при injectRegister 'auto'; без этих строк
        // обновление скачивалось и ждало, а страница не перезагружалась.
        skipWaiting: true,
        clientsClaim: true,
        // Архив (тысячи файлов, ~30 МБ) в предзагрузку не кладём —
        // кешируем по мере просмотра.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        globIgnores: ['legacy/**'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/legacy\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/legacy/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'legacy', expiration: { maxEntries: 500 } },
          },
        ],
      },
    }),
  ],
});
