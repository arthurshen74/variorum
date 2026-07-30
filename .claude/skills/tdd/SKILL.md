---
name: tdd
description: Spec-gated, test-first workflow for building anything new in Variorum — a capability (something the system DOES) or a system-wide property (something the system IS). Use whenever starting work on new behavior ("add", "build", "implement", "support") or when the human invokes /tdd. Not for doc-only edits, pure refactors, or bug fixes that already have a failing test.
---

# TDD workflow

The human is in charge. This skill structures the session as a sequence of
gates. At every STOP GATE: present your output, then wait for explicit
approval before continuing. Never skip a gate, never combine two gates into
one message, never start writing code before the test list is approved.

Read `design/DESIGN.md` and `CLAUDE.md` before starting. All hard
invariants in CLAUDE.md apply throughout and override anything here.

## Step 0 — Triage

Settle three questions with the human, in this order, before any spec text
is written:

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
  CLAUDE.md invariants and the extension contract, and their tests skew the
  other way: acceptance sweeps across surfaces, with unit tests only for
  the mechanism itself.

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

**3. Scope fork.** State the smallest shippable reading of the request and
at least one larger reading, and recommend one. (Example: "follow the
browser's color scheme" is shippable on its own; "in-app auto/light/dark
setting" layers on top later.)

STOP GATE — present the triage as three short answers and the recommended
scope. Wait.

## Step 1 — Spec

Write the documentation delta, routed per CLAUDE.md's routing rules:

- A DESIGN.md section: what the behavior is, the decisions it forced, and
  the rationale. For a property, the mechanism decision goes here.
- CLAUDE.md changes ONLY if a hard invariant is added or amended (substance
  stays in DESIGN.md; CLAUDE.md gets the one-line rule).
- Never restate a fact in two files.

STOP GATE — present the delta as a diff. The human approving this diff is
what makes it the spec. Wait.

## Step 2 — Test list

Derive the test list from the approved spec ONLY — every test must trace to
a sentence in it. Present as a flat list of test names with a one-line
behavior each, grouped by layer. The human edits this list — cuts, adds,
sharpens. Expect edits; do not defend the list.

Layer guidance:

- **Unit (Vitest, node environment)** — the TDD inner loop. Pure domain
  logic, resolution/decision functions, repository behavior against
  fake-indexeddb. This is where load-bearing logic gets its exhaustive
  cases.
- **Acceptance (Playwright, real Chromium)** — one spec per acceptance
  criterion or hard invariant the change touches. Use Playwright's
  emulation (e.g. `emulateMedia`) rather than mocking inside the app.
- **No jsdom tests for CSS or visual behavior** — jsdom has no cascade; at
  most one cheap wiring assertion (a class applied, a callback fired).
  Anything visual belongs to Playwright.

If the harness for a layer is not yet installed, say so — harness setup is
its own step, and any new dev dependency still requires human approval per
CLAUDE.md.

STOP GATE — the edited list is frozen. Wait for the human to say so.

## Step 3 — Red

Double loop: write ONE failing Playwright acceptance spec first (the
outermost behavior), then the failing unit tests. Run them; show the red
output. Red must be red for the right reason — a test failing on a missing
import proves nothing.

## Step 4 — Green

Implement until the full gate passes:

    npm run typecheck && npx vitest run && npx playwright test

Tests are LOCKED from Step 3 on. If a test appears wrong during
implementation, STOP and tell the human — never adjust it to pass. (This
rule is also a CLAUDE.md invariant; it binds even outside this skill.)

## Step 5 — Done

- Full gate green.
- Docs check: does the implementation match the approved spec? If reality
  diverged, the spec delta gets corrected FIRST, with human approval, then
  the code.
- Remind the human to commit.
