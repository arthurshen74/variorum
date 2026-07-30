---
name: tdd-plan-tests
description: Planning half of Variorum's TDD workflow. Triage a new capability (something the system DOES) or system-wide property (something the system IS), gate the spec with the human, then produce interface stubs, red tests, and an implementation manifest for /tdd-implement. Use when starting work on new behavior ("add", "build", "implement", "support") or when the human invokes /tdd-plan-tests. Not for doc-only edits, pure refactors, or bug fixes that already have a failing test. This skill NEVER writes implementation code.
---

# TDD workflow — plan and tests

The human is in charge. This skill structures the session as a sequence of
gates. At every STOP GATE: present your output, then wait for explicit
approval before continuing. Never skip a gate, never combine two gates
into one message. The session ends with red tests and a manifest;
implementation belongs to `/tdd-implement`, always in a separate run.

Read `design/DESIGN.md` and `CLAUDE.md` before starting. All hard
invariants and conventions in CLAUDE.md apply throughout and override
anything here.

## Step 0 — Triage

Settle three questions with the human, in this order, before any spec
text is written:

**1. Capability or property?** Is this something the system DOES — a
capability, like merge-import, revision history, chat — or something the
system IS — a property, like themable, observable, accessible,
offline-tolerant?

- *Capability* → a vertical slice: contained code surface, one new
  DESIGN.md feature section, tests concentrated in unit tests plus one
  acceptance e2e.
- *Property* → cross-cutting: before anything else, decide the single
  MECHANISM that implements the property (one place in the code, never
  per-feature scattered handling). Properties are more likely to touch
  CLAUDE.md invariants and the extension contract, and their tests skew
  the other way: acceptance sweeps across surfaces, with unit tests only
  for the mechanism itself.

**2. How essential is it?** Three tiers; the tier sets the rigor dial:

- *load-bearing* — the product is wrong without it (merge semantics,
  version immutability). Exhaustive test list including adversarial and
  evil cases; almost certainly adds or amends a CLAUDE.md invariant; full
  rationale paragraph in DESIGN.md.
- *expected* — users assume it (theming, keyboard navigation). Normal
  gates, normal test list.
- *peripheral* — nice-to-have. Minimal spec, the fewest tests that lock
  the behavior, and design it to be removable. Explicitly ask whether to
  build it now at all before proceeding.

**3. Scope fork.** State the smallest shippable reading of the request
and at least one larger reading, and recommend one.

STOP GATE — present the triage as three short answers and the recommended
scope. Wait.

## Step 1 — Spec

Write the documentation delta, routed per CLAUDE.md's routing rules:

- A DESIGN.md section: what the behavior is, the decisions it forced, and
  the rationale. For a property, the mechanism decision goes here.
- CLAUDE.md changes ONLY if a hard invariant is added or amended
  (substance stays in DESIGN.md; CLAUDE.md gets the one-line rule).
- Never restate a fact in two files.

STOP GATE — present the delta as a diff. The human approving this diff is
what makes it the spec. Wait.

## Step 2 — Interfaces and test list

Two artifacts, presented together, both derived from the approved spec
ONLY.

**Interface stubs** — the typed surface the change adds or alters:
function signatures, types, component props. Stub bodies compile and
throw `new Error('not implemented: <name>')` (the pre-implementation
`merge.ts` pattern). No logic in stubs. Every test imports real modules
through these stubs, so the compiler enforces that all test groups agree
on the interface — the same trick as `design/repository-api.ts`.

**Test list** — a flat list of test names with a one-line behavior each,
every test traceable to a sentence of the spec, organized into GROUPS.

A group is a unit of implementation work, defined by WRITE SCOPE: the set
of source files its implementation may touch. Group along layer and
module boundaries (domain / persistence / state / components /
extensions). Two groups whose write scopes overlap can never be
implemented concurrently and should usually be one group or explicitly
ordered. Small features are one group — that is normal, not a failure.

Layer guidance:

- **Unit (Vitest, node environment)** — the TDD inner loop. Pure domain
  logic, resolution/decision functions, repository behavior against
  fake-indexeddb. This is where load-bearing logic gets its exhaustive
  cases.
- **Acceptance (Playwright, real Chromium)** — one spec per acceptance
  criterion or hard invariant the change touches. Use Playwright's
  emulation (e.g. `emulateMedia`) rather than mocking inside the app.
- **No jsdom tests for CSS or visual behavior** — jsdom has no cascade;
  at most one cheap wiring assertion. Anything visual belongs to
  Playwright.

Tag every test title with its group — `[G1]`, `[G2]`, ... — in the
`describe` (unit) or `test` (e2e) title, so the filters in the manifest
work: `npx vitest run -t "[G1]"`, `npx playwright test --grep "\[G1\]"`.

STOP GATE — the human edits the list and the stub signatures; expect
edits and do not defend the draft. Frozen on approval. Wait.

## Step 3 — Red

Write the stubs and ALL the tests. Run the full suite and show the
output:

- `npm run typecheck` passes with stubs in place.
- Every new test is red for the RIGHT reason — a failed assertion or a
  not-implemented throw, never an import or compile error.
- Every previously existing test is still green.

## Step 4 — Manifest

Write `design/plans/<feature>.md` in the format below. The manifest never
restates the spec — it references DESIGN.md sections and records
mechanics only.

STOP GATE — present the manifest. On approval, remind the human to commit
(spec delta + stubs + tests + manifest = the planning commit) and state
which group `/tdd-implement` should take first. Then stop. Do not begin
implementation under any circumstances.

## Manifest format

```markdown
# Implementation manifest: <feature>

Spec: DESIGN.md § "<section title>" — approved <YYYY-MM-DD>
Stubs: <paths of stub files>
Full gate: npm run typecheck && npx vitest run && npx playwright test

## Groups

### G1 — <short name>
- Intent: <one line; details live in the spec — do not restate>
- Write scope: <source files implementation may touch>
- Tests: <test files> — filters: npx vitest run -t "[G1]" /
  npx playwright test --grep "\[G1\]"
- Depends on: <none | G#, G#>
- Status: RED

### G2 — ...

## Order

<Recommended implementation order and one line of rationale — layering,
dependencies. Groups with disjoint write scopes and no dependency edge
are parallel-safe; note them, but one-group-at-a-time is the default.>

## Amendments

<Empty at creation. /tdd-implement appends human-approved test
amendments: date, test, what changed, why.>
```

`Status` is flipped to `GREEN (<date>)` by `/tdd-implement` runs; this
file is the shared ledger between runs.
