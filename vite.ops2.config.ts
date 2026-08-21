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
// Vite's dev server has no idea this config owns a different entry: `input` is
// a BUILD option, so in dev the SPA fallback rewrote every navigation to the
// repository's index.html and port 5174 served the CUSTOMER app. Measured
// before this existed:
//
//   /                    → <title>Aluminium Windows &amp; Doors</title>
//   /ops2                → <title>OpenFrame ops2</title>   ← right, by accident
//   /ops2/record/p_demo  → <title>Aluminium Windows &amp; Doors</title>
//
// `/ops2` passed only because Vite's fallback tries `<path>.html` and ops2.html
// happens to sit at the root — an accident that reads as "it works" right up
// until someone reloads a deep link.
//
// So this server answers every NAVIGATION with ops2.html: `/`, `/ops2`, a deep
// link, and index.html or ops.html by name too. On this port those are the
// wrong application, and the most plausible way to open one is to type its
// filename. Pinned by scripts/tests/ops2-dev-server.test.mjs.
function ops2DevShell() {
  return {
    name: 'ops2-dev-shell',
    configureServer(server) {
      // Registered in the body, so it runs BEFORE Vite's own middlewares —
      // after them the fallback has already answered and the response is sent.
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? '/'
        // Only what a browser ASKS FOR AS A PAGE. Module and asset requests
        // send `*/*`, so the module graph is untouched; `/@vite/client` and
        // `/@react-refresh` are excluded by name as well, because a rewrite
        // that swallowed them would serve a page that then failed to boot.
        const isNavigation = (req.method === 'GET' || req.method === 'HEAD')
          && (req.headers.accept ?? '').includes('text/html')
          && !url.startsWith('/@')
        if (isNavigation) req.url = '/ops2.html'
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [
    ops2DevShell(),
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

  // No SPA fallback of Vite's own. ops2DevShell() above supplies the fallback,
  // aimed at the right entry; 'mpa' turns off the one aimed at index.html. A
  // navigation the plugin somehow missed now 404s loudly instead of quietly
  // serving the customer site, which is how the original defect stayed hidden.
  appType: 'mpa',

  // `npm run dev:ops2` — its own port, so the customer dev server keeps 5173
  // and neither graph is ever loaded by the other's dev server.
  //
  // WHAT THIS SERVER IS AND IS NOT. It is where you develop ops2's UI, and
  // scripts/tests/ops2-dev-server.test.mjs keeps it honest about serving ops2.
  // It is NOT where ops2's routing is verified: it has no host routing and no
  // opsShellFor, so `/ops2` resolves here because the plugin above rewrites it,
  // not because anything selected a shell. Shell selection, the ops host and
  // deep-link reload are tested against the real Worker —
  // scripts/tests/api.test.mjs and scripts/tests/web/ops2.spec.ts. If those two
  // and this one ever disagree, the Worker is right.
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
