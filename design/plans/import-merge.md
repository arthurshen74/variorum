# Implementation manifest: import-merge

Spec: DESIGN.md § "Import Is a Merge" (including § "Settled edges") — approved 2026-07-30
Stubs: src/domain/merge.ts (planMerge, RENAME_SEPARATOR, IMPORTED_TAG); src/persistence/repository.ts (call site passes the uuid mint)
Full gate: npm run typecheck && npx vitest run && npx playwright test

## Groups

### G1 — planMerge (domain)
- Intent: the pure merge planner — trichotomy, landing-spot guard, renames, report.
- Write scope: src/domain/merge.ts
- Tests: src/domain/merge.test.ts — filters: npx vitest run -t "[G1]"
- Depends on: none
- Status: RED

### G2 — importDatabase end to end
- Intent: repository executes the plan; the two locked acceptance criteria.
- Write scope: src/persistence/repository.ts, src/persistence/indexed-db-wrapper.ts (touch only if plan execution needs fixing)
- Tests: src/persistence/repository.import.test.ts, e2e/import-merge.spec.ts — filters: npx vitest run -t "[G2]" / npx playwright test --grep "\[G2\]"
- Depends on: G1
- Status: RED

## Order

G1 then G2. Disjoint write scopes but a hard dependency edge: G2's tests
exercise importDatabase, which is meaningless while planMerge throws. G2 is
expected to be small or a no-op — the execution path already exists.

## Amendments

