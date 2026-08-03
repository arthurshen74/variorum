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
- Status: RED

### G2 — dialogs and shell wiring
- Intent: ConfigurationsDialog (List/Add/Edit/Endpoint), NewUnitDialog,
  ArchiveConfirm, sidebar buttons, AppShell dialog ownership; shadcn init
  (Radix build) + Dialog + Slider vendored here
- Write scope: src/components/dialogs/ConfigurationsDialog.tsx,
  src/components/dialogs/NewUnitDialog.tsx,
  src/components/dialogs/ArchiveConfirm.tsx,
  src/components/shell/Sidebar.tsx, src/components/shell/AppShell.tsx,
  components.json, src/components/ui/*, src/lib/utils.ts,
  package.json, package-lock.json
- Tests: e2e/management-ui.spec.ts — filter:
  npx playwright test --grep "\[G2\]"
- Depends on: G1, G3
- Status: RED

## Order

G1 and G3 first (disjoint write scopes, no edge between them —
parallel-safe, but one-at-a-time is the default), then G2, whose Save
paths call both. G2 is where the approved dependencies enter
package.json.

## Amendments

(empty)
