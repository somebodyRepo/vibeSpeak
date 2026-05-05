import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    host: true, // Listen on all addresses
    port: 5173,
    // 仅在开发环境启用代理，方便本地开发调试
    proxy: mode === 'development' ? {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
      },
    } : undefined,
  },
  preview: {
    host: true,
    port: 5173,
  },
}))
