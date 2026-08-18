# Implementation manifest: response chrome

Spec: DESIGN.md § "Chat" — "Response chrome is Streamdown's, made
functional — copy yes, download no" — approved 2026-08-18
Stubs: none — the change alters no typed surface (one CSS directive plus
an existing, already-typed Streamdown prop)
Full gate: npm run typecheck && npx vitest run && npx playwright test

## Groups

### G1 — response chrome

- Intent: make Streamdown's copy/fullscreen controls functional and
  remove its download controls (see spec)
- Write scope: src/index.css, src/components/ai-elements/message.tsx
- Tests: e2e/response-chrome.spec.ts — filters: npx vitest run -t "[G1]"
  (no unit tests; runs zero) / npx playwright test --grep "\[G1\]"
- Depends on: none
- Status: GREEN (2026-08-18)

## Order

Single group; no ordering concerns.

Operational notes for the implementing run:

- Test "[G1] table copy as Markdown puts the pipe table on the
  clipboard" is a green-at-birth regression lock: table copy already
  worked before the fix (its action bar never had the broken
  pointer-events wrapper). The other six tests are red.
- Judge red/green only against a FRESHLY STARTED dev server. Tailwind's
  dev pipeline accumulates every class candidate it has ever seen and
  never drops them on rescan, and playwright.config.ts reuses an
  existing server on 5173 — a stale server can mask either state.
- Do not spell bare Tailwind class tokens in prose or test strings; the
  heuristic source scan reads every non-ignored file, markdown and
  specs included, and a written class name silently enters the compiled
  CSS (the why lives in the spec section).

## Amendments
