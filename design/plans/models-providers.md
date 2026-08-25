# Implementation manifest: models-providers

Spec: DESIGN.md § "Models and Providers", § "LLM Provider Interface"
("Protocol adapters"), § "Management UI" (Models/Providers, Add), § "Chat"
(step 2, Errors), § "Configurations" (model identifier) — approved
2026-08-25. Guide: `design/adding-an-api-surface.md`.
Stubs: `src/llm/protocols/{adapter,registry,openai-compatible,anthropic-messages}.ts`,
`src/llm/{provider-document,provider-mutations,provider-migration,resolve-model}.ts`,
`src/llm/local-storage-stub.ts` (test helper, real),
`src/components/dialogs/{provider-form.ts,ProvidersView.tsx}`
Full gate: npm run typecheck && npx vitest run && npx playwright test

## Groups

### G1 — Protocol adapters
- Intent: one adapter per wire protocol behind a registry; nothing
  outside `src/llm/protocols/` names a protocol literal.
- Write scope: `src/llm/protocols/*`. Deletes `src/llm/transport.ts`.
  Retires `src/llm/transport.test.ts` (its wire assertions live in the
  adapter tests).
- Tests: `src/llm/protocols/registry.test.ts`,
  `src/llm/protocols/openai-compatible.test.ts`,
  `src/llm/protocols/anthropic-messages.test.ts` — filters:
  npx vitest run -t "[G1]"
- Depends on: none
- Status: RED

### G2 — Document, mutations, migration, resolution
- Intent: the `variorum.llm` document — validator, read/write/seed, pure
  mutations, the legacy fold, and handle resolution with the two
  request-time errors.
- Write scope: `src/llm/provider-document.ts`,
  `src/llm/provider-mutations.ts`, `src/llm/provider-migration.ts`,
  `src/llm/resolve-model.ts`. Deletes `src/llm/model-binding.ts`.
  Retires `src/llm/model-binding.test.ts` (URL/key helper cases carried
  into `provider-document.test.ts`).
- Tests: `src/llm/provider-document.test.ts`,
  `src/llm/provider-mutations.test.ts`,
  `src/llm/provider-migration.test.ts`, `src/llm/resolve-model.test.ts`
  — filters: npx vitest run -t "[G2]" (also matches older [G2] tags in
  `chat-transport.anthropic.test.ts`; filter by file when needed)
- Depends on: G1 (registry for the validator)
- Status: RED

### G3 — Transport wiring
- Intent: the chat transport resolves the handle through the document at
  call time, prepares the request via the adapter, and turns resolution
  failures into error chunks before any network.
- Write scope: `src/llm/chat-transport.ts`, `e2e/model-endpoint.ts`, and
  the amended seeding in the three files under Amendments A1–A3.
- Tests: `src/llm/chat-transport.providers.test.ts` — filters:
  npx vitest run -t "[G3]" (also matches older [G3] tags in
  `chat-transport.test.ts`; filter by file when needed)
- Depends on: G1, G2
- Status: RED

### G4 — Dialog and tree
- Intent: the Models/Providers tree view, the endpoint and model forms,
  the hint list and key-gap flag, and the configuration form's handle
  combobox.
- Write scope: `src/components/dialogs/ProvidersView.tsx` (plus
  `EndpointForm.tsx` / `ModelForm.tsx` if it splits),
  `src/components/dialogs/provider-form.ts`,
  `src/components/dialogs/ConfigurationsDialog.tsx`. Deletes
  `src/components/dialogs/ModelsView.tsx`,
  `src/components/dialogs/model-binding-form.ts`. Retires
  `src/components/dialogs/model-binding-form.test.ts` and
  `e2e/model-bindings.spec.ts`.
- Tests: `src/components/dialogs/provider-form.test.ts`,
  `e2e/models-providers.spec.ts` — filters: npx vitest run -t "[G4]" /
  npx playwright test --grep "\[G4\]" (the grep also matches older [G4]
  tags in `chat.spec.ts`; run `e2e/models-providers.spec.ts` by file)
- Depends on: G2 (unit part); G1, G2, G3 (acceptance)
- Status: RED

## Order

G1 → G2 → G3 → G4. Strictly layered: the validator reads the registry,
the transport reads the document and the registry, the view reads all
three. G1 and G2's unit tests could be developed in parallel on disjoint
files, but G2 cannot go green before G1's registry exists; one group at
a time is the default. Retired test files are deleted by the group that
deletes the module they cover — not before, so the suite stays green
between groups.

## Amendments

Pre-approved at planning (2026-08-25), applied by the G3 run. These
three files rely on the silent LM Studio default or seed legacy
`variorum.model.*` records; assertions stay byte-identical, only
seeding changes:

- A1 `src/llm/chat-transport.test.ts` — `beforeEach` seeds a
  `variorum.llm` document binding `test-model` to
  `http://localhost:1234/v1` (openai-compatible, no auth). Why: no
  silent default endpoint (DESIGN.md "Resolution").
- A2 `src/llm/chat-transport.usage.test.ts` — same seeding. Same why.
- A3 `src/llm/chat-transport.anthropic.test.ts` — `seedBinding` writes
  the document (an auth-required anthropic endpoint with the key,
  holding the model under `handle = modelName`) instead of a legacy
  record. Why: the transport reads `variorum.llm`, not legacy keys.
- A4 `e2e/model-endpoint.ts` (test infra) — seeds the document; its
  seven callers are untouched.
