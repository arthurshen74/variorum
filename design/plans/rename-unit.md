# Implementation manifest: rename unit

Spec: DESIGN.md § "Management UI" (Sidebar unit controls — Rename) —
approved 2026-08-05
Stubs: none — renameConversation already exists in
design/repository-api.ts and src/persistence/repository.ts; the UI change
adds no new exported surface, so the e2e tests go red on missing locators
instead of a not-implemented throw.
Full gate: npm run typecheck && npx vitest run && npx playwright test

## Groups

### G1 — sidebar rename affordance
- Intent: per-row pencil → prefilled input; Enter commits, Escape/blur
  cancels, trimmed-empty or unchanged calls nothing
- Write scope: src/components/shell/Sidebar.tsx
- Tests: src/persistence/repository.rename.test.ts,
  e2e/rename-unit.spec.ts — filters:
  npx vitest run src/persistence/repository.rename.test.ts /
  npx playwright test e2e/rename-unit.spec.ts (file-scoped because the
  "[G1]" tag collides with earlier manifests' groups)
- Depends on: none
- Status: RED

## Order

One group. Note: the four repository tests are green at birth — they are
first-time regression locks on the pre-existing renameConversation, not
TDD-red tests. The group's RED status is carried by the four Playwright
tests; GREEN means all eight pass with no regressions.

## Amendments

(none)
