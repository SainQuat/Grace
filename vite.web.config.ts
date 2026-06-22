import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve('src/renderer'),
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src')
    }
  },
  plugins: [react()],
  build: {
    outDir: resolve('out/web'),
    emptyOutDir: true
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.CONDUCTOR_PORT || process.env.PORT || 3000)
  },
  preview: {
    host: '127.0.0.1',
    port: Number(process.env.CONDUCTOR_PORT || process.env.PORT || 4173)
  }
})
