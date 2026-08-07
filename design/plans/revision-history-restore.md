# Implementation manifest: revision-history-restore

Spec: DESIGN.md § "Revision History & Restore", plus the "Extensions"
amendments (`ExtensionDefinition.validates`, growth-rule second
admission) and the rewritten rollback paragraph in § "LinkML Graph
Viewer" — approved 2026-08-07
Stubs: src/extensions/extension.ts (validates field),
src/extensions/registry.ts (linkml-graph validates entry),
src/domain/revision-validity.ts,
src/components/artifact/HistoryDialog.tsx,
src/components/artifact/ParseFailureBanner.tsx
Full gate: npm run typecheck && npx vitest run && npx playwright test

## Groups

### G1 — validity primitives
- Intent: `findLastValid` and the linkml-graph `validates` hook
  (dynamic import of linkml-model)
- Write scope: src/extensions/extension.ts, src/extensions/registry.ts
  (the validates entry only), src/domain/revision-validity.ts
- Tests: src/domain/revision-validity.test.ts,
  src/extensions/registry.test.ts ("[G1] registry validates" describe) —
  filter: npx vitest run -t "[G1]"
- Depends on: none
- Status: GREEN (2026-08-07)

### G2 — History dialog
- Intent: the HistoryDialog component and its pane wiring (History
  button, restore via saveManualEdit)
- Write scope: src/components/artifact/HistoryDialog.tsx,
  src/components/artifact/ArtifactPane.tsx
- Tests: e2e/revision-history.spec.ts — filter:
  npx playwright test --grep "\[G2\]"
- Depends on: none
- Status: GREEN (2026-08-07)

### G3 — parse-failure banner
- Intent: the ParseFailureBanner component and its pane wiring
  (latest-saved-revision trigger, restore-last-valid action)
- Write scope: src/components/artifact/ParseFailureBanner.tsx,
  src/components/artifact/ArtifactPane.tsx
- Tests: e2e/parse-failure-banner.spec.ts — filter:
  npx playwright test --grep "\[G3\]"
- Depends on: G1, G2
- Status: GREEN (2026-08-07)

## Order

G1, then G2, then G3. G1 and G2 have disjoint write scopes and no
dependency edge — parallel-safe if two worktrees are wanted — but
one-at-a-time is the default. G3 shares ArtifactPane.tsx with G2 and
consumes G1's primitives, so it is strictly last, never parallel with
G2. Filter caveat: "[G1]"/"[G3]" also match green tests from the
linkml-graph-viewer manifest; the ratchet reads only this feature's
files going green.

## Amendments

(none)
