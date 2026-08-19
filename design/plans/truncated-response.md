# Implementation manifest: truncated response discards

Spec: DESIGN.md § "Truncation discards, too" (Chat) and the amended §
"Errors" (Chat) — approved 2026-08-19. CLAUDE.md's artifact-revision
invariant gained the failed-not-completed sentence (Data model).

Stubs: src/llm/chat-transport.ts (FINISH_REASON_LENGTH,
TRUNCATED_RESPONSE_MESSAGE, failOnTruncation — the stub is deliberately
NOT wired into sendMessages, so the existing transport tests stay green
through the red phase; wiring it is part of G1).

Full gate: npm run typecheck && npx vitest run && npx playwright test

Note on filters: [G1] tags also exist in older manifests' tests. Scope
every filter by file path as written below.

Harness changes made at planning time, both additive with defaults, so
no existing test changed behavior:

- e2e/mock-llm.ts — `ScriptedResponse.finishReason`, defaulting to
  'stop' in `finish()`; held streams remember it for `release()`.
- src/llm/chat-transport.test.ts — `sseBody`/`scriptedFetch` take a
  finish reason, defaulting to 'stop'.

## Groups

### G1 — transport: classify a length finish as a failure
- Intent: implement failOnTruncation and wire it around the
  toUIMessageStream result in sendMessages. Everything downstream —
  discard-on-error, the error row, Retry — already exists and must stay
  untouched; if ChatPane needs a change, that is a spec question, not an
  implementation liberty (see Open risk).
- Write scope: src/llm/chat-transport.ts
- Tests: src/llm/chat-transport.test.ts (describes "[G1]
  failOnTruncation" and "[G1] VariorumChatTransport — truncation"),
  e2e/truncated-response.spec.ts — filters:
  npx vitest run src/llm/chat-transport.test.ts /
  npx playwright test e2e/truncated-response.spec.ts
- Depends on: none
- Status: RED

## Order

One group; nothing to sequence.

## Open risk

The slice rests on `useChat` turning an `error` chunk into
`status === 'error'` with `error.message` taken from `errorText` — which
is what ChatPane's existing error row renders. The red run confirmed the
upstream half (a `length` finish does reach the chunk stream as
`{type:'finish', finishReason:'length'}`); the downstream half is proven
only by the acceptance specs. If `useChat` reports a generic message
instead, the fix widens the write scope to
src/components/shell/ChatPane.tsx and G1 becomes two groups — stop and
raise it rather than absorbing it.

## Amendments

(none)
