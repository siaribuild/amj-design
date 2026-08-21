import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  // Three SPA entries: the customer site (index.html), the ops console
  // (ops.html) and its successor (ops2.html). The Worker picks between them in
  // `opsShellFor()` — customer vs ops by host, ops vs ops2 by path prefix while
  // the two coexist (ADR 0002, spec §12).
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        ops: path.resolve(__dirname, 'ops.html'),
        ops2: path.resolve(__dirname, 'ops2.html'),
      },
    },
  },

  // Dev: proxy the API to the Worker running under `wrangler dev` (port 8787),
  // so the SPA (vite) and the backend (worker) run side by side locally.
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
