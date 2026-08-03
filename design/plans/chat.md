# Implementation manifest: chat

Spec: DESIGN.md § "Chat" (+ `Message.reasoning` in application-schema.yaml) — approved 2026-08-03
Stubs: design/repository-api.ts (Message.reasoning, AssistantCompletion.reasoning, completeExchange contract), src/domain/extract.ts (partitionResponse), src/llm/mapping.ts (toUIMessages, toModelMessages, completionFromUIMessage), src/llm/chat-transport.ts, src/components/chat/ChatMessage.tsx, src/components/chat/ArtifactChip.tsx
Full gate: npm run typecheck && npx vitest run && npx playwright test

## Groups

### G1 — domain & dump boundary
- Intent: partitionResponse; the hand-written dump validator learns Message.reasoning.
- Write scope: src/domain/extract.ts, src/domain/dump-file.ts
- Tests: src/domain/extract.test.ts, src/domain/dump-file.reasoning.test.ts, src/domain/merge.reasoning.test.ts — filters: npx vitest run -t "[G1]"
- Depends on: none
- Status: GREEN (2026-08-03)

### G2 — repository
- Intent: completeExchange persists reasoning. (The unchanged-artifact comparison already exists; its tests are locks.)
- Write scope: src/persistence/repository.ts
- Tests: src/persistence/repository.chat.test.ts — filters: npx vitest run -t "[G2]" (this file only; older suites reuse the [G2] tag)
- Depends on: G1 (types)
- Status: RED (1 red; 6 green-at-birth locks on the existing unchanged/messageIndex/version-tagging behavior)

### G3 — llm layer
- Intent: SDK boundary mappings and VariorumChatTransport (latest-saved recipe at call time; reasoning never re-sent; top_k and reasoning_effort must reach the wire — the provider drops both natively, the injectable fetch wrapper is the sanctioned path).
- Write scope: src/llm/mapping.ts, src/llm/chat-transport.ts, src/llm/transport.ts (only if fetch threading requires it)
- Tests: src/llm/mapping.test.ts, src/llm/chat-transport.test.ts — filters: npx vitest run -t "[G3]"
- Depends on: G1 (types)
- Status: RED

### G5 — keep-or-take
- Intent: ArtifactPane follows landing revisions (clean → silently, dirty → prompt).
- Write scope: src/components/artifact/ArtifactPane.tsx
- Tests: e2e/artifact-collision.spec.ts — filters: npx playwright test --grep "\[G5\]"
- Depends on: none (tests land revisions through the repository dev handle)
- Status: RED

### G4 — chat UI
- Intent: ChatPane over useChat + AI Elements; ChatMessage, ArtifactChip; loader, cancel-discards, error row, badge.
- Write scope: src/components/chat/**, src/components/shell/ChatPane.tsx, src/components/ai-elements/** (vendored), package.json (vendoring AI Elements adds runtime deps — LIST THEM AND GET HUMAN APPROVAL before install, per CLAUDE.md)
- Tests: e2e/chat.spec.ts (+ helper e2e/mock-llm.ts) — filters: npx playwright test --grep "\[G4\]"
- Depends on: G1, G2, G3, and G5 (the chip spec asserts the editor pane shows the landed revision — G5's follow behavior)
- Status: RED

## Order

G1 → G2 → G3 → G5 → G4. Layering bottom-up; G5 sits before G4 because
the G4 chip spec exercises G5's follow-silently behavior. G2, G3, and G5
have disjoint write scopes and no edges between them — parallel-safe
after G1 — but one-group-at-a-time remains the default.

## Amendments

(none)
