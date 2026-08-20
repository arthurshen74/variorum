# Implementation manifest: token usage display

Spec: DESIGN.md § "Chat" → "Token usage display" (+ the localStorage
exception amended in CLAUDE.md) — approved 2026-08-20
Stubs: src/llm/token-usage.ts, src/llm/chat-transport.ts
(finishUsageMetadata)
Full gate: npm run typecheck && npx vitest run && npx playwright test

## Groups

### G1 — token-usage mechanism
- Intent: per-model chars-per-token calibration in localStorage, streamed
  character counting, metadata narrowing, readout display grammar.
- Write scope: src/llm/token-usage.ts
- Tests: src/llm/token-usage.test.ts — filter:
  npx vitest run src/llm/token-usage.test.ts
  (the bare "[G1]" grep collides with other features' [G1] tests)
- Depends on: none
- Status: GREEN (2026-08-20)

### G2 — transport usage plumbing
- Intent: opt into stream_options.include_usage; the terminal usage
  payload crosses as UsageMetadata on the finish chunk, tagged with the
  request version's modelName; truncation path unchanged.
- Write scope: src/llm/chat-transport.ts, src/llm/transport.ts
- Tests: src/llm/chat-transport.usage.test.ts — filter:
  npx vitest run src/llm/chat-transport.usage.test.ts
- Depends on: G1 (types)
- Status: GREEN (2026-08-20)

### G3 — readout in the exchange-state slot
- Intent: ChatPane renders the readout (label "Token usage"): estimating
  while in flight, settled exact figures on completion, baseline carried
  to the next send, calibration recorded on finish, idle on error/reload.
- Write scope: src/components/shell/ChatPane.tsx
- Tests: e2e/token-usage.spec.ts — filter:
  npx playwright test e2e/token-usage.spec.ts
- Depends on: G1, G2
- Status: GREEN (2026-08-20)

## Order

G1 → G2 → G3 (type and metadata dependencies; write scopes are disjoint
but the chain leaves nothing parallel-safe in practice). e2e/mock-llm.ts
gained usage scripting as test infrastructure during planning; it is not
in any write scope.

## Amendments

<!-- /tdd-implement appends human-approved test amendments here. -->
