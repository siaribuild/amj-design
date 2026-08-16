import { defineConfig, enforceTdd } from '@nizos/probity'

// TDD guardrails (Probity). Scope deliberately:
// - include the dirs holding business logic and the test suites
// - leave out UI components, migrations, docs, and config
// Globs are anchored at this file's directory.
export default defineConfig({
  rules: [
    {
      // EDIT ME: e.g. ['server/**', 'src/lib/**', 'tests/**']
      files: ['{{LOGIC_DIR}}/**', '{{TEST_DIR}}/**'],
      rules: [enforceTdd()],
    },
  ],
})
