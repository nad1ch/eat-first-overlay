import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const canonicalOrigin = (env.VITE_PUBLIC_CANONICAL_ORIGIN || '').replace(/\/$/, '')

  return {
    plugins: [
      vue(),
      {
        name: 'inject-seo-head',
        transformIndexHtml(html) {
          let out = html
          if (canonicalOrigin) {
            const canonical = `${canonicalOrigin}/`
            if (!out.includes('rel="canonical"')) {
              out = out.replace('</head>', `    <link rel="canonical" href="${canonical}" />\n</head>`)
            }
          }
          return out
        },
      },
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('firebase')) return 'firebase'
            if (id.includes('vue-i18n')) return 'vue-i18n'
            if (id.includes('vue-router')) return 'vue-router'
            if (id.includes('vue')) return 'vue-core'
          },
        },
      },
    },
  }
})
