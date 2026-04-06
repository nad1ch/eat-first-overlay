import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { liveKitDevTokenPlugin } from './vite-plugin-livekit-dev.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // У middleware для /__livekit/token потрібні LIVEKIT_API_KEY / SECRET з .env (без префікса VITE_).
  const loaded = loadEnv(mode, __dirname, '')
  for (const [k, v] of Object.entries(loaded)) {
    if (process.env[k] === undefined && v !== '') process.env[k] = v
  }

  return {
    plugins: [
      vue(),
      liveKitDevTokenPlugin(),
      /* canonical + og:url виставляються клієнтом (useSeoCanonical) під повний шлях і query — статичний «лише /» ламає Lighthouse SEO на /control тощо. */
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('firebase')) return 'firebase'
            if (id.includes('livekit')) return 'livekit'
            if (id.includes('vue-i18n')) return 'vue-i18n'
            if (id.includes('vue-router')) return 'vue-router'
            if (id.includes('vue')) return 'vue-core'
          },
        },
      },
    },
  }
})
