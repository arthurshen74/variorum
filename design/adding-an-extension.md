# Adding an Extension

The mechanics of adding an artifact-editor extension. The rationale for
the contract's shape lives in [DESIGN.md "Extensions"](DESIGN.md); the
contract itself is
[`src/extensions/extension.ts`](../src/extensions/extension.ts). This
file restates neither — it is the checklist.

## Steps

1. **Create the directory** — `src/extensions/<id>/`, kebab-case id
   (e.g. `linkml-graph`).
2. **Write the component** — a function component taking `EditorProps`,
   exported as **default** (required by `React.lazy`; the sanctioned
   deviation from the named-export convention). It renders a view of
   `content` and proposes edits ONLY via `onChange(next)`.
3. **Respect `readOnly`** — when true, never call `onChange`.
   View-only interactions (zoom, pan, node dragging) stay available;
   they don't touch the artifact.
4. **Register it** — add an `ExtensionDefinition` to the array in
   `src/extensions/registry.ts`: id, tab title, `appliesTo`, and
   `component: lazy(() => import('./<id>/<Component>'))`. Order
   matters: the first applicable definition is the default tab, so
   specific extensions go ABOVE the code editor (`appliesTo: () =>
   true`).
5. **Scope `appliesTo`** — a pure predicate over
   `{ artifactType, configName, unitId }`; match the narrowest signal
   that is honest (e.g. `ctx.configName === 'linkml'`).

## The fences

- Import ONLY React, the extension's own libraries, and
  `../extension.ts` — never the store, the repository, `@/components`,
  or another extension.
- A new npm library requires human approval BEFORE it enters
  `package.json` (CLAUDE.md).
- Theming arrives ambiently via CSS variables: style with `var(--…)`
  tokens from `src/index.css` (the code editor's `chromeTheme` is the
  pattern). Never detect or toggle the theme yourself.
- Device state — layout, viewport, collapsed panels; never anything
  artifact-meaningful — may persist in localStorage under
  `variorum.ext.<extensionId>.<unitId>`. Everything else is ephemeral.
  Never touch IndexedDB.

## Testing

- Pure logic (parsers, projections, geometry) lives in plain TS modules
  inside the extension directory, tested with Vitest (node
  environment).
- Visual and interactive behavior is Playwright's job — no jsdom for
  CSS or visuals (CLAUDE.md).
- The component stays thin: props in, `onChange` out.

## Done

The standard gate (CLAUDE.md "Definition of done"), plus a manual check
that the tab appears only for matching units and lazy-loads on first
open.
