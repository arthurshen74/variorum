# Implementation manifest: Database view

Spec: DESIGN.md § "Management UI" (the Database view bullet and its
closing paragraph) — approved 2026-08-23
Stubs: src/components/dialogs/database-actions.ts,
src/components/dialogs/DatabaseView.tsx (plus the onReplaced prop on
ConfigurationsDialogProps, threaded from AppShell)
Full gate: npm run typecheck && npx vitest run && npx playwright test

## Groups

### G1 — action orchestration
- Intent: outcomes for export / import / pick-replace / replace over
  injected ports, and ImportReport rendering
- Write scope: src/components/dialogs/database-actions.ts
- Tests: src/components/dialogs/database-actions.test.ts — filter:
  npx vitest run -t "[G1]"
- Depends on: none
- Status: GREEN (2026-08-23)

### G2 — dialog view, gear button, shell wiring
- Intent: the fifth dialog view, the sidebar gear icon, and
  replace-deselects-active-unit
- Write scope: src/components/dialogs/DatabaseView.tsx,
  src/components/dialogs/ConfigurationsDialog.tsx,
  src/components/shell/Sidebar.tsx, src/components/shell/AppShell.tsx
- Tests: e2e/database-view.spec.ts — filter:
  npx playwright test --grep "\[G2\]" e2e/database-view.spec.ts
- Depends on: G1
- Status: RED

## Order

G1 then G2 — the view renders what the orchestration decides, so the
pure layer lands first. Write scopes are disjoint but the dependency
edge forbids parallel runs anyway.

Accessibility contract G2 must honor: the gear button keeps the
accessible name "Configurations" (management-ui.spec.ts locates it by
name); outcomes render under role="status", errors under role="alert";
the replace confirmation's buttons are "Confirm replace" and "Cancel".

## Amendments

