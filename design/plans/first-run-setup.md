# Implementation manifest: first-run-setup

Spec: DESIGN.md § "First-Run Setup"; § "Models and Providers" ("First run
and migration"); § "Replace — the wholesale door" ("One write may
follow"); § "Management UI" (New unit); § "Chat" (Errors) — approved
2026-11-20. Invariants: CLAUDE.md "Data model" (model-choice controls are
Saves; the built-in `link-ml`) and "Conventions" (`variorum.llm` is never
seeded).
Stubs: `design/repository-api.ts` (`ensureBuiltInConfiguration`),
`src/persistence/repository.ts` (throwing stub),
`src/components/dialogs/database-actions.ts` (`DatabasePorts` gains the
port; `DatabaseView.tsx` wires it), `src/llm/resolve-model.ts`
(`boundHandles`), `src/components/setup/{setup-step.ts,model-choice.ts}`.
`src/domain/seed-configuration.ts` is REAL, not a stub (see "Green at
planning").
Full gate: npm run typecheck && npx vitest run && npx playwright test

Filters are by file: the `[G1]`–`[G3]` tags in the titles also match
older features' tags.

## Groups

### G1 — Built-in configuration
- Intent: `link-ml` always exists — created by
  `ensureBuiltInConfiguration` after boot and after every successful
  replace, never inside either.
- Write scope: `src/persistence/repository.ts`, `src/main.tsx`,
  `src/components/dialogs/database-actions.ts` (`runReplace` only),
  `src/extensions/registry.ts` (the `'link-ml'` literal becomes
  `BUILT_IN_CONFIGURATION_NAME`), and the test files under amendments
  A2–A7. `src/domain/seed-configuration.ts` is already final: do not
  edit it.
- Tests: `src/domain/seed-configuration.test.ts`,
  `src/persistence/repository.built-in.test.ts`,
  `src/components/dialogs/database-actions.built-in.test.ts`,
  `e2e/built-in-configuration.spec.ts` — filters:
  npx vitest run src/domain/seed-configuration.test.ts
  src/persistence/repository.built-in.test.ts
  src/components/dialogs/database-actions.built-in.test.ts /
  npx playwright test e2e/built-in-configuration.spec.ts
- Depends on: none
- Status: GREEN (2026-11-20)

### G2 — Setup gate
- Intent: an absent `variorum.llm` is empty; a document with no endpoint
  or no model raises a blocking dialog at load that walks Add Endpoint
  and Add Model, and offers Restore from backup.
- Write scope: `src/llm/provider-document.ts`,
  `src/components/setup/setup-step.ts`,
  `src/components/setup/SetupGate.tsx` (new),
  `src/components/shell/AppShell.tsx`,
  `src/components/dialogs/EndpointForm.tsx`,
  `src/components/dialogs/ModelForm.tsx` (Cancel becomes optional), and
  the files under amendments A8–A10. Reads but does not modify
  `database-actions.ts` and `file-io.ts`.
- Tests: `src/llm/provider-document.first-run.test.ts`,
  `src/components/setup/setup-step.test.ts`, `e2e/first-run.spec.ts` —
  filters: npx vitest run src/llm/provider-document.first-run.test.ts
  src/components/setup/setup-step.test.ts /
  npx playwright test e2e/first-run.spec.ts
- Depends on: none. Run after G1: both amend
  `e2e/models-providers.spec.ts` (A7, A9).
- Status: RED

### G3 — Model choice at use
- Intent: a configuration naming an unbound handle gets a model picker in
  the New Unit dialog and on the chat error row; choosing is a labelled
  Save that mints the next version with only the handle changed.
- Write scope: `src/llm/resolve-model.ts`,
  `src/components/setup/model-choice.ts`, a shared picker component
  beside it (new), `src/components/dialogs/NewUnitDialog.tsx`,
  `src/components/shell/ChatPane.tsx` (plus a new file under
  `src/components/chat/` if the error row splits out),
  `src/components/dialogs/ConfigurationsDialog.tsx` and
  `src/components/dialogs/provider-form.ts` (their private bound-handle
  computations adopt `boundHandles`; their existing tests stay
  untouched and green).
- Tests: `src/llm/bound-handles.test.ts`,
  `src/components/setup/model-choice.test.ts`,
  `e2e/model-choice.spec.ts` — filters:
  npx vitest run src/llm/bound-handles.test.ts
  src/components/setup/model-choice.test.ts /
  npx playwright test e2e/model-choice.spec.ts
- Depends on: none
- Status: RED

## Order

G1 → G2 → G3: the order a user meets the pieces. Source write scopes are
disjoint across all three. G1 and G2 both amend
`e2e/models-providers.spec.ts`, so they run in sequence; G3 is
parallel-safe with either.

## Green at planning

Not every new test is red at the planning commit. Both kinds are
expected; neither is a defect in the red phase.

- **The seed file is real** (human decision, 2026-11-20).
  `src/domain/seed-configuration.ts` is data, written by hand at
  planning so no later run needs any outside source for it. All four
  tests in `src/domain/seed-configuration.test.ts` are green.
- **Guards** lock what the implementation must NOT do, so they pass
  before it exists and must still pass after:
  - `database-actions.built-in.test.ts` — "skips the check when the
    replace rejects".
  - `e2e/first-run.spec.ts` — "a document with a model opens no gate";
    "a malformed document opens no gate and is left byte-identical".
  - `e2e/model-choice.spec.ts` — "a bound configuration shows no
    picker, and Create saves no version"; "a missing-API-key failure
    shows no picker"; "a network failure on a bound handle shows no
    picker"; "with no model in the document, the error row offers only
    Retry".

Red at planning: 30 unit tests (six new files) and 24 e2e tests (three
new specs). Every test that existed before planning is green.

## Amendments

Applied at planning (2026-11-20), forced by the stub interface:

- A1 `src/components/dialogs/database-actions.test.ts` — the `makePorts`
  fake gains `ensureBuiltInConfiguration`. Why: `DatabasePorts` gained
  the port and the fake must satisfy the type. Assertions untouched.

Pre-approved at planning (2026-11-20), applied by the G1 run. Why, for
all six: `link-ml` now exists in every database from load.

- A2 `e2e/linkml-graph.spec.ts`, `e2e/parse-failure-banner.spec.ts` —
  seeding stops creating a configuration named `link-ml` (the repository
  rejects the duplicate) and creates its units on the built-in.
  Assertions untouched.
- A3 `e2e/management-ui.spec.ts` — the configuration-name list and the
  New unit picker lists gain `link-ml`; `configurationVersions` counts
  and `configurations[0]` lookups are taken for the configuration under
  test by name; "the New unit button is disabled with zero active
  configurations" archives `link-ml` first.
- A4 `e2e/import-merge.spec.ts` — `skippedIdentical` 2 → 3; the sorted
  name list gains `link-ml`.
- A5 `e2e/dump-transport.spec.ts` — the restored and post-import name
  lists gain `link-ml`.
- A6 `e2e/database-view.spec.ts`, `e2e/import-replace.spec.ts` — after a
  replace (through the view, or raw followed by a reload) the name list
  `['fresh']` becomes `['fresh', 'link-ml']`.
- A7 `e2e/models-providers.spec.ts` — in "an unbound handle shows the
  exact error row…", `expect(hint).toBeHidden()` becomes "the hint list
  no longer lists `ghost`": the built-in's own handle keeps the list
  visible.

Pre-approved at planning (2026-11-20), applied by the G2 run:

- A8 `playwright.config.ts` (test infra) — a default `storageState`
  holding a `variorum.llm` document with one endpoint and one model,
  under names no spec uses. Why: the specs that never seed a document
  must open past the gate. Specs that seed their own document override
  it; `e2e/first-run.spec.ts` already opts out.
- A9 `e2e/models-providers.spec.ts` — "…shows the seeded LM Studio
  endpoint with no models" is retired (the behavior is removed;
  `e2e/first-run.spec.ts` covers what replaced it); "legacy
  variorum.model.* records are folded on first open…" opts out of A8's
  default so the document starts absent.
- A10 `src/llm/provider-document.test.ts` — "read on an absent key seeds
  one LM Studio endpoint with no models and writes it" is retired
  (`provider-document.first-run.test.ts` covers what replaced it); "read
  ignores variorum.baseUrl and variorum.apiKey" expects no endpoints.

Approved during the G1 run (2026-11-20). Why, for both: the same
"alone in the database" assumption A3 and A7 amend, at call sites
planning missed. Assertions untouched.

- A11 `e2e/management-ui.spec.ts` — the four Edit-flow tests (five call
  sites) find the `linkml` row with
  `.filter({ has: page.getByText('linkml', { exact: true }) })` instead
  of `.filter({ hasText: 'linkml' })`. Playwright's string `hasText` is
  a case-insensitive substring match, so it also matched the built-in's
  row through its description "LinkML modeling assistant.".
- A12 `e2e/models-providers.spec.ts` — "the configuration form's Model
  field offers the document's handles…" asserts on the versions named
  `free` rather than on every version: `link-ml.1` is in the dump too.

Abstraction candidates for the implementing runs to record in
`DESIGN_ABSTRACTION_CANDIDATES.md` (Longshots, two instances each): the
replace confirmation UI (Database view, setup gate) and the "load the
document or show its error" helper (Models/Providers view, setup gate).
