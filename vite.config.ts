import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    watch: {
      ignored: [
        '**/node_modules/**',
        '**/.wwebjs_auth/**',
        '**/.wwebjs_cache/**',
        '**/session/**',
        '**/tokens/**',
      ]
    }
  }
})
