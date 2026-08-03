# Implementation manifest: management UI

Spec: DESIGN.md § "Management UI" and § "API Keys & Endpoint URL" —
approved 2026-08-03
Stubs: src/components/dialogs/configuration-form.ts,
src/components/dialogs/ConfigurationsDialog.tsx,
src/components/dialogs/NewUnitDialog.tsx,
src/components/dialogs/ArchiveConfirm.tsx,
src/llm/transport.ts (parseBaseUrl, clearBaseUrl, DEFAULT_BASE_URL export)
Full gate: npm run typecheck && npx vitest run && npx playwright test

Approved dependencies (2026-08-03, human-approved): radix-ui, clsx,
tailwind-merge, lucide-react — vendored via `npx shadcn init -b radix`
plus Dialog and Slider. Anything beyond these four requires fresh
approval.

## Groups

### G1 — configuration form logic
- Intent: pure validation/prefill/comparison behind the dialog's Save
- Write scope: src/components/dialogs/configuration-form.ts
- Tests: src/components/dialogs/configuration-form.test.ts — filter:
  npx vitest run -t "[G1]"
- Depends on: none
- Status: GREEN (2026-08-03)

### G3 — endpoint URL logic
- Intent: parseBaseUrl boundary validation, clearBaseUrl reset
- Write scope: src/llm/transport.ts
- Tests: src/llm/transport.test.ts — filter: npx vitest run -t "[G3]"
- Depends on: none
- Status: GREEN (2026-08-03)

### G2 — dialogs and shell wiring
- Intent: ConfigurationsDialog (List/Add/Edit/Endpoint), NewUnitDialog,
  ArchiveConfirm, sidebar buttons, AppShell dialog ownership; shadcn init
  (Radix build) + Dialog + Slider vendored here
- Write scope: src/components/dialogs/ConfigurationsDialog.tsx,
  src/components/dialogs/NewUnitDialog.tsx,
  src/components/dialogs/ArchiveConfirm.tsx,
  src/components/shell/Sidebar.tsx, src/components/shell/AppShell.tsx,
  components.json, src/components/ui/*, src/lib/utils.ts,
  package.json, package-lock.json, src/index.css, src/index.old.css
- Tests: e2e/management-ui.spec.ts — filter:
  npx playwright test e2e/management-ui.spec.ts (the "[G2]" grep also
  catches unrelated [G2] tests in import-merge.spec.ts and
  import-replace.spec.ts)
- Depends on: G1, G3
- Status: GREEN (2026-08-03)

## Order

G1 and G3 first (disjoint write scopes, no edge between them —
parallel-safe, but one-at-a-time is the default), then G2, whose Save
paths call both. G2 is where the approved dependencies enter
package.json.

## Amendments

- 2026-08-03 — dependencies. `shadcn init -b radix` in shadcn 4.16.1 is
  preset-driven and brought four packages beyond the approved four:
  `class-variance-authority` (button.tsx uses cva; dialog.tsx imports
  Button), `tw-animate-css` and `shadcn` (the CLI, whose
  `shadcn/tailwind.css` defines the `data-open`/`data-closed` variants the
  vendored dialog uses), and `@fontsource-variable/geist` (the Nova
  preset's font). Human chose to accept all four as scaffolded rather than
  hand-trim the vendored components. Approved list is now those eight.
- 2026-08-03 — write scope. `src/index.css` added: init merges its token
  block and the four `@import` lines there, and the human authorized the
  rewrite. `src/index.old.css` added as the human's pre-init copy for
  comparison.
- No test amendments. Every test in e2e/management-ui.spec.ts passed as
  written.
