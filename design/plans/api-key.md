# Implementation manifest: API key field

Spec: DESIGN.md § "API Keys & Endpoint URL" and § "Management UI"
(Endpoint view bullet) — approved 2026-08-03
Stubs: src/llm/transport.ts (normalizeApiKey, clearApiKey)
Full gate: npm run typecheck && npx vitest run && npx playwright test

## Groups

### G1 — API key field and unset-key transport
- Intent: masked API key field on the Endpoint view; unset key sends no
  Authorization header (placeholder fallback removed)
- Write scope: src/llm/transport.ts,
  src/components/dialogs/ConfigurationsDialog.tsx
- Tests: src/llm/transport.test.ts, e2e/api-key.spec.ts — filters:
  npx vitest run src/llm/transport.test.ts -t "[G1]" /
  npx playwright test e2e/api-key.spec.ts
  (the bare "[G1]" grep collides with other features' [G1] tests)
- Depends on: none
- Status: GREEN (2026-08-03)

## Order

Single group. e2e/mock-llm.ts gained request-header recording as test
infrastructure during planning; it is not in the write scope.

## Amendments

<!-- /tdd-implement appends human-approved test amendments here. -->
