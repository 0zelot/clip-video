import tailwindcss from '@tailwindcss/vite'

// Clip is a pure client-side application: no SSR, no server routes, no backend.
// `nuxt generate` produces a static bundle in `.output/public` that is used both
// for web hosting and as the Capacitor `webDir` for Android.
export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  ssr: false,
  devtools: { enabled: false },

  modules: ['@pinia/nuxt'],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'Clip',
      htmlAttrs: { lang: 'en', class: 'dark' },
      meta: [
        { charset: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no',
        },
        { name: 'theme-color', content: '#0b0b10' },
        { name: 'description', content: 'Clip - private, offline video editor for short-form content.' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
    },
  },

  // Workers are bundled as ES modules so they can use code splitting (mediabunny).
  vite: {
    plugins: [tailwindcss()],
    worker: { format: 'es' },
    optimizeDeps: { include: ['mediabunny', 'idb', 'immer'] },
  },

  // The project is plain JavaScript; Nuxt only generates editor tooling config.
  typescript: {
    typeCheck: false,
  },
})
