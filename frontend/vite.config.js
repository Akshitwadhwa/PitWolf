import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
    // The project lives under ~/Desktop, where macOS privacy protection can stop
    // node from receiving FSEvents. Without polling the watcher fails silently:
    // edits are never picked up and the served bundle stays stale until restart.
    watch: {
      usePolling: true,
      interval: 150,
    },
  },
})
