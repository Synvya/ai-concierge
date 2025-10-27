import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const apiProxyTarget = env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      sourcemap: true,
    },
    define: {
      // Polyfill Buffer for browser
      'global': 'globalThis',
    },
    resolve: {
      alias: {
        buffer: 'buffer/',
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        define: {
          global: 'globalThis',
        },
      },
    },
  }
})
