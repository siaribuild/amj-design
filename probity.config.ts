import { defineConfig, enforceTdd } from '@nizos/probity'

// TDD guardrails (Probity). Scope chosen deliberately:
// - worker/** and src/data/** carry the business logic covered by scripts/tests/*.mjs
// - scripts/tests/** is included so test writes are held to one-failing-test-at-a-time
// - UI components (src/ outside data/), migrations, docs, and config stay exempt.
export default defineConfig({
  rules: [
    {
      files: ['worker/**', 'src/data/**', 'scripts/tests/**'],
      rules: [enforceTdd()],
    },
  ],
})
