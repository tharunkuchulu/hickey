import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    // Workspace packages are bundled; real node_modules deps (better-sqlite3 etc.) stay external.
    plugins: [externalizeDepsPlugin({ exclude: ['@hickey/db', '@hickey/shared'] })],
    resolve: { alias: { '@main': resolve('src/main') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
    plugins: [react(), tailwindcss()],
    // electron-vite leaves bundles unminified by default; the POS terminal is slow, so minify the UI.
    build: { minify: 'esbuild', sourcemap: false }
  }
})
