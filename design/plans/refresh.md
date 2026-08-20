# Implementation manifest: Refresh the stranded user message

Spec: DESIGN.md § "Refresh — the stranded user message" (Chat) —
approved 2026-08-19. No CLAUDE.md change: the persisted-before-send
invariant constrains ordering relative to the REQUEST, not relative to
the user's message, so the notice's new after-the-message placement
needs no amendment. No application-schema.yaml change — the slice adds
no persisted field.

Stubs: design/repository-api.ts (appendPendingEditNotice declaration),
src/persistence/repository.ts (the throwing stub).

Full gate: npm run typecheck && npx vitest run && npx playwright test

Note on filters: [G1] and [G2] tags also exist in older manifests'
tests. Scope every filter by file path as written below.

No harness changes were needed: mock-llm.ts already scripts failures,
held streams, and finish reasons.

Planning-time deviation from the approved test list: the three negative
[G2] tests ("no Refresh when …") passed vacuously in the red run,
because a control that does not exist yet is trivially hidden. Each was
re-anchored on a positive assertion of the same rule — reach the
stranded state, assert Refresh IS offered, then assert it goes away on
the recorded response / the in-flight stream / the error row. Same
behavior, now able to fail. Titles changed accordingly.

## Groups

### G1 — repository: appendPendingEditNotice
- Intent: implement the declared method. It reuses pendingEditNotice and
  editNoticeContent unchanged; the only new thing is where the message
  lands.
- Write scope: src/persistence/repository.ts, design/repository-api.ts
- Tests: src/persistence/repository.refresh.test.ts (describe "[G1]
  appendPendingEditNotice — the Refresh notice") — filter:
  npx vitest run src/persistence/repository.refresh.test.ts
- Depends on: none
- Status: GREEN (2026-08-20)

### G2 — chat pane: the Refresh control
- Intent: render the control in the transcript's exchange-state slot on
  the spec's condition, and wire it to append any pending notice, re-seed
  useChat from the record, and re-send. The error row and its Retry stay
  untouched — chat.spec.ts and truncated-response.spec.ts lock them.
- Write scope: src/components/shell/ChatPane.tsx
- Tests: e2e/refresh.spec.ts — filter:
  npx playwright test e2e/refresh.spec.ts
- Depends on: G1
- Status: GREEN (2026-08-20)

## Order

G1 then G2 — G2 calls G1's method, so they are strictly ordered rather
than parallel-safe, despite disjoint write scopes.

## Open risk

G2 re-seeds useChat with setMessages and then calls regenerate() in the
same handler, mirroring the existing send path. regenerate() keeps a
trailing user message (it slices to messageIndex + 1 for a user role) —
verified in the installed SDK, but only by reading it. If the re-seed
does not settle before regenerate() reads the list, the fix belongs in
ChatPane and stays inside G2's write scope.

The predicate for "stranded" is inlined in ChatPane rather than extracted
to src/domain/, so it is covered by e2e only. Its one non-obvious case —
after a Refresh appends a notice, the trailing message is a user-role
notice and the unit is still refreshable — is locked by the G2 manual-edit
test. Extracting it to a tested pure function is a spec amendment, not an
implementation liberty.

## Amendments

(none)
