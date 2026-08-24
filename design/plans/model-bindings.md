# Implementation manifest: model bindings & Anthropic Messages

Spec: DESIGN.md § "LLM Provider Interface", § "Model Bindings", and
§ "Management UI" (Models view bullet) — approved 2026-08-24
Stubs: src/llm/model-binding.ts, src/llm/transport.ts
(ANTHROPIC_BROWSER_HEADER, createModel),
src/components/dialogs/model-binding-form.ts
Full gate: npm run typecheck && npx vitest run && npx playwright test

## Groups

### G1 — model binding module
- Intent: the `variorum.model.<modelName>` localStorage contract — parse
  boundary, defaults, per-model isolation, dead legacy keys — plus the
  ported endpoint-URL / API-key normalization boundaries.
- Write scope: src/llm/model-binding.ts
- Tests: src/llm/model-binding.test.ts — filter:
  npx vitest run src/llm/model-binding.test.ts
  (the bare "[G1]" grep collides with other features' [G1] tests)
- Depends on: none
- Status: GREEN (2026-08-24)

### G2 — transport and request assembly
- Intent: createModel builds one provider per binding protocol
  (@ai-sdk/anthropic joins @ai-sdk/openai-compatible); the chat transport
  resolves the binding at request time, sends the Messages-only output
  cap, and never sends a reasoning knob on the Messages wire. Deletes the
  legacy global getters/setters that lose their last importer here.
  Installs the human-approved @ai-sdk/anthropic dependency.
- Write scope: src/llm/transport.ts, src/llm/chat-transport.ts,
  package.json, package-lock.json, e2e/model-endpoint.ts (harness only —
  drop its legacy `variorum.baseUrl` seed line once the transport reads
  bindings; it holds no assertions)
- Tests: src/llm/transport.test.ts,
  src/llm/chat-transport.anthropic.test.ts — filters:
  npx vitest run src/llm/transport.test.ts src/llm/chat-transport.anthropic.test.ts
- Depends on: G1
- Status: GREEN (2026-08-24)

### G3 — Models view
- Intent: the Configurations dialog swaps the Endpoint view for the
  per-model Models view (fieldset per model; API selector, endpoint URL,
  key, Messages-only max output tokens; Save/Reset). Deletes whatever the
  old Endpoint view still imports.
- Write scope: src/components/dialogs/model-binding-form.ts,
  src/components/dialogs/ModelsView.tsx,
  src/components/dialogs/ConfigurationsDialog.tsx,
  src/llm/transport.ts (deletion only)
- Tests: src/components/dialogs/model-binding-form.test.ts,
  e2e/model-bindings.spec.ts — filters:
  npx vitest run src/components/dialogs/model-binding-form.test.ts /
  npx playwright test e2e/model-bindings.spec.ts
- Depends on: G1, G2 (the e2e specs exercise the wire end to end)
- Status: GREEN (2026-08-24)

## Order

G1 → G2 → G3; each group's surface is the next one's dependency, and the
write scopes are disjoint, so no pair is parallel-safe in practice — run
them in order.

Planning-session test changes, recorded: the old Endpoint-view
acceptance moved out of e2e/management-ui.spec.ts and
e2e/api-key.spec.ts (file deleted) into e2e/model-bindings.spec.ts under
the approved spec change; seven chat specs now seed their MockLlm URL
through e2e/model-endpoint.ts (which dual-seeds the legacy key until G2
— see G2's write scope); e2e/mock-anthropic.ts is new test
infrastructure and in no write scope. The old transport.test.ts URL/key
boundary cases were ported verbatim into model-binding.test.ts.

## Amendments

<!-- /tdd-implement appends human-approved test amendments here. -->

2026-08-24 — G3 write scope, no test change. Added src/llm/transport.ts
(deletion only): G3's intent is to delete what the old Endpoint view
imported, and those legacy globals live in transport.ts, which G2 left
standing for exactly this run. Added src/components/dialogs/ModelsView.tsx:
ConfigurationsDialog.tsx was already 530 lines, so the Models view goes in
its own file per the DatabaseView precedent and CLAUDE.md's size rule.
