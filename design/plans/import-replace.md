# Implementation manifest: import-replace

Spec: DESIGN.md § "Import Is a Merge" (subsection "Replace — the wholesale
door") + amended § "Persistence & Data Model" and § "State Architecture" —
approved 2026-07-30
Stubs: src/domain/merge.ts (assertValidDump); src/persistence/
indexed-db-wrapper.ts (clearAndPutMany); src/persistence/repository.ts
(replaceDatabase); design/repository-api.ts (interface method)
Full gate: npm run typecheck && npx vitest run && npx playwright test

## Groups

### G1 — assertValidDump (domain)
- Intent: extract the shared dump-boundary guard; rewire planMerge onto it
  with messages the locked regexes (/schema/i, /ghost-name interpolation/)
  still match.
- Write scope: src/domain/merge.ts
- Tests: src/domain/merge.validation.test.ts — filter:
  npx vitest run src/domain/merge.validation.test.ts
- Depends on: none
- Status: GREEN (2026-07-30)

### G2 — replaceDatabase end to end
- Intent: clearAndPutMany (atomic wipe-and-load) + the repository method;
  pre-wipe backup as return value, refusals touch nothing, dirty bit,
  prune interaction.
- Write scope: src/persistence/indexed-db-wrapper.ts,
  src/persistence/repository.ts
- Tests: src/persistence/repository.replace.test.ts,
  e2e/import-replace.spec.ts — filters:
  npx vitest run src/persistence/repository.replace.test.ts /
  npx playwright test import-replace.spec.ts
- Depends on: G1
- Status: RED

## Order

G1 then G2: replaceDatabase's refusal tests are meaningless while
assertValidDump throws not-implemented. Note the [G1]/[G2] tags are reused
from import-merge (both GREEN there), so the filters above are file-scoped,
not -t-scoped — a -t "[G1]" sweep would also run import-merge's locked
tests, harmless but noisy.

## Amendments

