# Implementation manifest: view-revision

Spec: DESIGN.md § "Revision History & Restore" (the View amendments) — approved 2026-08-23
Stubs: src/components/artifact/view-buffer.ts, src/components/artifact/HistoryDialog.tsx (onView prop), src/components/artifact/ArtifactPane.tsx (throwing onView call site)
Full gate: npm run typecheck && npx vitest run && npx playwright test

## Groups

### G1 — View seats the buffer
- Intent: View action in the History dialog seats a revision in the pane's editable buffer, with the confirm gate and the version-aware chip.
- Write scope: src/components/artifact/view-buffer.ts, src/components/artifact/ArtifactPane.tsx, src/components/artifact/HistoryDialog.tsx
- Tests: src/components/artifact/view-buffer.test.ts, e2e/view-revision.spec.ts — filters: npx vitest run -t "[G1]" /
  npx playwright test --grep "\[G1\]"
- Depends on: none
- Status: GREEN (2026-08-23)

## Order

Single group — the whole slice is one write scope in the artifact pane.

## Amendments

