import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:4317' }, // dev: forward API to backend
  },
})
