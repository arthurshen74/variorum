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
- Status: RED

## Order

G1, then G2, then G3. G1 and G2 have disjoint write scopes and no
dependency edge — parallel-safe if two worktrees are wanted — but
one-at-a-time is the default. G3 composes both and goes last.

## Amendments

(none)
