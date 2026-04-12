import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['recharts', 'framer-motion', 'lucide-react']
  },
  server: {
    port: 5173,
    proxy: {
      '/profile': { target: 'http://localhost:8000', changeOrigin: true },
      '/plan': { target: 'http://localhost:8000', changeOrigin: true },
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/auto-apply': { target: 'http://localhost:8000', changeOrigin: true },
      '/interview': { target: 'http://localhost:8000', changeOrigin: true },
      '/generate-plan': { target: 'http://localhost:8000', changeOrigin: true },
      '/upload-resume': { target: 'http://localhost:8000', changeOrigin: true },
      '/apply-links': { target: 'http://localhost:8000', changeOrigin: true },
      '/log-study': { target: 'http://localhost:8000', changeOrigin: true },
      '/health': { target: 'http://localhost:8000', changeOrigin: true },
      '/mission-control': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
