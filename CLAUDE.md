# CLAUDE.md

Variorum is a single-file artifact editor: an SPA (React / TypeScript strict /
Tailwind / Vite / shadcn / Vercel AI Elements) talking directly to an
OpenAI-compatible LLM endpoint (LM Studio first). There is no server and no
backend — do not add one. Read `design/DESIGN.md` before implementing
anything; it is the design source of truth.

## Documentation routing — where prose goes

Every fact lives in exactly ONE file. Other files summarize and link; they
never restate. When asked to "document" something, route it:

- **`design/DESIGN.md`** — the single source of truth for ALL design and
  architecture decisions and their rationale. New decisions, changed
  decisions, new design features: they go here, and only here.
- **`README.md`** — the human-facing pitch: what Variorum is, the use case,
  a one-paragraph architecture trailer, and license. It links to DESIGN.md
  and contains no design detail beyond that trailer. Edit it only when the
  pitch itself changes. Never copy DESIGN.md content into it.
- **`CLAUDE.md`** (this file) — instructions and hard invariants for coding
  agents. Update only when an invariant or convention is added or changed.

If a documentation change seems to need the same information in two files,
put the substance in DESIGN.md and a link in the other file.

## Hard invariants — never violate, never "simplify" away

Data model:

- Configuration versions are **immutable and append-only**. Never edit or
  delete an existing version; a change mints the next version (`linkml.4` →
  `linkml.5`), and only via an explicit user Save. Unsaved draft state must
  never be used in a request.
- Generation always uses the **latest saved version** of the unit's
  configuration. Every response is tagged with the exact config version
  (`name.N`) that produced it.
- A **unit** (conversation + artifact) is bound to one configuration _name_
  at creation, for life. No re-pointing a unit at a different configuration.
- Units are atomic: the artifact and its conversation are never deleted
  independently.
- Artifact revisions are captured on each completed LLM response that changes
  the artifact and on each explicit manual save — no debounced autosave
  revisions.
- Deletion is **soft** everywhere (archived flag). The interface-only "prune
  archived conversations" function is the ONLY true delete in the system, and
  it never touches configurations. Prune REQUIRES a fresh export: the
  repository refuses to prune unless an export has happened since the last
  mutation.
- Import is a MERGE, never a replace. It never overwrites, renumbers, or
  deletes: identical records are skipped, strict prefixes fast-forward,
  and diverged histories are kept BOTH (fresh uuid for units; fresh name
  for configuration lineages, rewriting incoming units' configName). Never
  splice diverged conversations. See DESIGN.md "Import Is a Merge".
- Everything persists in ONE IndexedDB database, exactly three object
  stores: `configurations` (name records: description, artifactType,
  archived), `configurationVersions` (immutable recipes), `units`. Shapes
  are declared in `design/application-schema.yaml`. The single exception:
  API keys live in localStorage. Export is a full-database dump including
  archived units and all configuration versions.
- `artifactType` lives on the configuration _name_ record — set at
  creation, never edited. Version records contain no mutable fields at
  all; `archived` flags exist only on name records and units.

State management (see DESIGN.md "State Architecture"; the repository's
surface is `design/repository-api.ts`):

- ONE Zustand store, hydrated from IndexedDB once at boot. The repository
  module is the ONLY code that writes IndexedDB and the ONLY code that
  updates the store. Write order: IndexedDB `put` first, then store update.
- The IndexedDB wrapper is hand-written (open/getAll/put/delete-by-key
  only). Do NOT introduce Redux, React Query, Dexie, idb, or any other
  state or storage library.
- Configuration draft state is component-local only — never in the Zustand
  store, never persisted, never in a request.
- Streaming chat state lives in the AI SDK's `useChat`; it is committed to
  the unit via the repository only when a response completes.

LLM tool surface:

- The LLM's tool list and the interface's function list are different by
  design. The model gets ONLY: create unit, load unit, list units (active
  only), and `archive_conversation` (human-confirmation gated). It must never
  see archived units.
- The model NEVER gets tools for: export, import, prune, restore, or any
  read/write access to configurations. Configurations contain the system
  prompt — model write access would let prompt injection persist itself.
- Never name a model-facing tool with "delete" semantics; archiving is the
  strongest verb the model holds.

## Conventions

- TypeScript strict mode throughout.
- **NEVER add an npm library without asking the human first.** This applies
  in every agent mode, including autonomous ones: no external dependency
  enters this project without a human being reviewing and approving the
  addition. If a task seems to need a new library, stop and ask.
- Lockfile discipline: commit the lockfile, install with `npm ci`,
  `ignore-scripts` in `.npmrc`, keep direct dependencies minimal, take
  updates deliberately.
- The LLM transport goes through the OpenAI-compatible API; sampling
  parameters (temperature, top_p, top_k) and reasoning effort come from the
  active configuration version — never hardcode them.
- Source layering (see DESIGN.md "Source Layout"): imports point downward
  only — components → state / llm → persistence → domain. `repository.ts`
  is the ONLY importer of `indexed-db-wrapper.ts`, and it declares
  `implements VariorumRepository` imported from `design/repository-api.ts`
  — never redeclare that interface locally.
- Never name a file `idb` — an npm library has that name; the wrapper is
  `indexed-db-wrapper.ts`.
- Extensions (`src/extensions/`, see DESIGN.md "Extensions"): an extension
  imports ONLY React, its own libraries, and `extension.ts` — never the
  store, the repository, or other components. The host imports extensions
  only via `registry.ts`. Every extension component is `React.lazy`. The
  extension contract gains a field only when a SECOND consumer needs it.
