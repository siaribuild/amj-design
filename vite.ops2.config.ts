import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// ops2's build graph — separate from vite.config.ts on purpose.
//
// ops2 rides React Router 5 (Ionic 8's router peer) while the customer site and
// the legacy console stay on React Router 7. Two majors in one repo is safe only
// while they never meet in one graph, and the cheapest way to guarantee that is
// two configs rather than one config with an importer-keyed resolver: a resolver
// has to behave identically in dev prebundling (esbuild) and in build (rollup),
// which is exactly the "alias-and-pray" surface this split exists to avoid.
//
// Design: `docs/design/ops2-ionic-boundary.md` §2.2, decision recorded in
// `docs/adr/0005-ops2-ionic-adopted.md` — both on the `design/ops2-planning`
// branch; `docs/adr/0009-frameflow-themes-ops2.md` on this branch is the map.
// `scripts/tests/ops2-deps.test.mjs` is what notices if the split rots.
export default defineConfig({
  plugins: [
    // Same plugin set as the customer config — Make requires both, even where
    // Tailwind is not actively used.
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Every bare `react-router` import in THIS graph — react-router-dom@5's
      // internals and @ionic/react-router's — resolves to the one aliased v5
      // copy. Two instances would mean two React contexts and silently broken
      // routing: no error, no warning, links that simply do nothing.
      //
      // Order matters. Vite matches aliases in order and this is a bare-string
      // (prefix) match, so 'react-router' would also capture 'react-router-dom'
      // if it came first — which would resolve the v5 DOM bindings to the core
      // package and break the build outright.
      'react-router-dom': path.resolve(__dirname, 'node_modules/react-router-dom'),
      'react-router': path.resolve(__dirname, 'node_modules/react-router-5'),
      '@': path.resolve(__dirname, './src'),
    },
  },

  assetsInclude: ['**/*.svg', '**/*.csv'],

  build: {
    // Second pass into the same dist/ as the customer build. emptyOutDir:false
    // is what makes it a second pass rather than a replacement — `npm run build`
    // runs this config after the shared one, and the Worker's asset serving and
    // host routing are untouched by the split.
    rollupOptions: {
      input: { ops2: path.resolve(__dirname, 'ops2.html') },
    },
    emptyOutDir: false,
  },

  // `npm run dev:ops2` — its own port, so the customer dev server keeps 5173
  // and neither graph is ever loaded by the other's dev server.
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
