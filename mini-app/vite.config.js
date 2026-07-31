import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    hmr: {
      host: '10.139.126.83',
    },
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
