# Implementation manifest: linkml-graph-viewer

Spec: DESIGN.md § "LinkML Graph Viewer", plus the "Extensions" amendments
("Extension device state", `ExtensionContext.unitId`) — approved 2026-08-06
Stubs: src/extensions/extension.ts (unitId field, threaded in
src/components/artifact/ArtifactPane.tsx),
src/extensions/linkml-graph/linkml-model.ts,
src/extensions/linkml-graph/flow-graph.ts,
src/extensions/linkml-graph/layout.ts,
src/extensions/linkml-graph/device-state.ts,
src/extensions/linkml-graph/LinkmlGraphViewer.tsx
Full gate: npm run typecheck && npx vitest run && npx playwright test

## Groups

### G1 — projection
- Intent: `parseLinkmlSchema` — normalize LinkML YAML into the
  effective-slots graph model, boundaries included
- Write scope: src/extensions/linkml-graph/linkml-model.ts
- Tests: src/extensions/linkml-graph/linkml-model.test.ts — filter:
  npx vitest run -t "[G1]"
- Depends on: none
- Status: GREEN (2026-08-06)

### G2 — flow mapping, layout, device state
- Intent: `toFlowGraph`, `layoutGraph` (ELK), `loadDeviceState` /
  `saveDeviceState`
- Write scope: src/extensions/linkml-graph/flow-graph.ts,
  src/extensions/linkml-graph/layout.ts,
  src/extensions/linkml-graph/device-state.ts
- Tests: src/extensions/linkml-graph/flow-graph.test.ts,
  layout.test.ts, device-state.test.ts — filter:
  npx vitest run -t "[G2]"
- Depends on: none
- Status: GREEN (2026-08-06)

### G3 — component, registry, acceptance
- Intent: the LinkmlGraphViewer component (React Flow rendering,
  last-good-parse, auto-arrange, persistence wiring) and its registry
  entry
- Write scope: src/extensions/linkml-graph/LinkmlGraphViewer.tsx,
  src/extensions/registry.ts, plus new presentational files under
  src/extensions/linkml-graph/ (node/edge components)
- Tests: src/extensions/registry.test.ts, e2e/linkml-graph.spec.ts —
  filters: npx vitest run -t "[G3]" /
  npx playwright test --grep "\[G3\]"
- Depends on: G1, G2
- Status: GREEN (2026-08-07)

## Order

G1, then G2, then G3. G1 and G2 have disjoint write scopes and no
dependency edge — parallel-safe if two worktrees are wanted — but
one-at-a-time is the default. G3 composes both and goes last.

## Amendments

- 2026-08-07 — e2e/linkml-graph.spec.ts, "breaking the YAML in the Editor
  keeps the last-good graph with a stale notice" → "…replaces the graph
  with a parse error". Spec delta first (DESIGN.md "LinkML Graph Viewer",
  "Boundary handling"): a failed parse now renders the error in place of
  the canvas instead of the last successfully parsed graph. Two reasons.
  The behaviour: a rendered graph reads as a picture of the current
  artifact, and the case that matters — a model response landing
  unparseable YAML — is exactly where a stale picture misleads and a
  banner is missed. The test: its fixture never broke anything, because
  CodeMirror's bracket auto-closing turned the typed `classes: {` into a
  valid `classes: {}`, which G1 fixes as an empty graph rather than an
  error (linkml-model.test.ts:310) — so the test passed through the
  success path under either behaviour. Fixture is now `a: b: c`.
  Rollback-to-last-parsing-revision was raised in the same discussion and
  is recorded in DESIGN.md as a separate slice, not built here.
