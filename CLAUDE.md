# CLAUDE.md

Variorum is a single-file artifact editor: an SPA (React / TypeScript strict /
Tailwind / Vite / shadcn / Vercel AI Elements) talking directly to an
OpenAI-compatible LLM endpoint (LM Studio first). There is no server and no
backend — do not add one. Read `design/DESIGN.md` before implementing
anything; it is the design source of truth.

## Coding Conventions

So the whole point of coding conventions and guidance is what MY definition of good
code is. So, some basic statements first before going into detail:

- Good code is as simple as it needs to be, and simple can be complicated enough.
- Good code must be understandable by a human. I did NOT say easily understandable but understandable enough.
- Here is my new fundamental: Good code must be understandable enough by a generative large language model given a reasonable context traversal depth, say two levels of traversal internally (be careful about traversing into an external library). This context traversal depth may change with time and with the nature of the project. For this project, 2 levels should be ok.
- Good code must be observable and traceable.

So, with that said, the details:

### Comments

- Default to writing simple comments, what it does, NOT WHY.
- Only specify the _why_ when it is not obvious: a hidden constraint, a subtle invariant, a workaround for a specific bug, behaviour that would surprise a reader.
- Write simple and short _what_ comments where appropriate for a senior engineer.
- Never write justifications, change history, or task references ("added for the X flow", "used by Y", "fixes #123"). Those belong in PR descriptions and rot.
- You may write multi-line, multi-paragraph doc strings only at the top of a file and that is to provide a human readable description of the contents of the file (modules, functions, etc.)

### Constants and magic strings

- Avoid magic strings. A string literal that names something in an external contract — a datastore field name, an index/column/key name, a discriminator value — must be a module-level `SCREAMING_SNAKE` constant, not an inline literal.
- The constant is the single source of truth: the _same_ constant is referenced on every side of the contract. A field name used when writing must be the same constant used when reading (e.g. ES `index_*` and `search` reference one `FIELD_PROJECT_UUID`, never two copies of `"project_uuid"`). This is what stops a rename from silently breaking one side.
- Controlled value sets (discriminators, status vocabularies) are `StrEnum`, not loose constants — see `ChunkType`, `IngestStatus`. Use the enum member everywhere; never re-type its value.
- Scope the constant to the module that owns the contract. Don't build a global "constants" dumping ground; a field name lives next to the client that owns the index/table.
- This is not a DRY judgement call — a contract literal used in two places is promoted on the _second_ use, not the fourth.

### DRY (and when not)

- Duplicate freely up to three similar instances. The shape of the abstraction is rarely clear before then.
- Keep a list of abstraction candidates in `DESIGN_ABSTRACTION_CANDIDATES.md`. This list will be populated with 2 similar instances as "Longshots" and 3 similar instances as "Good Bet".
- Extract on the fourth instance, or when the duplication crosses a module boundary. If the abstraction is in the candidates list, remove it once the extraction is complete.
- Premature abstraction is worse than duplication. Three explicit, similar functions are easier to change than one parameterised helper guessed at the wrong dimensions.
- Inform the human if a Longshot abstraction candidate is encountered. The human may want to build the abstraction early if they know they will need it.

### Abstractions, layers, helpers

- Don't add features, refactor, or introduce abstractions beyond what the task requires.
- A bug fix doesn't need surrounding cleanup. A one-shot operation doesn't need a helper.
- No half-finished implementations. No "we might want this later" hooks.

### Error handling

- Trust internal code and framework guarantees. Don't validate that a non-nullable field is non-null.
- Validate at system boundaries only: user input, external APIs, file parses, LLM responses (already enforced via Pydantic schemas).
- Don't add fallbacks for scenarios that can't happen. If they happen, you want a crash and a stack trace, not silent recovery.
- Logs at boundaries, not inside helpers. One log per failure, not three.

### Backwards compatibility

- Don't add backwards-compat shims, deprecated re-exports, or `# removed` placeholder comments.
- If something is unused, delete it. Git history is the audit trail.
- No feature flags for code paths that can simply be replaced.

### TypeScript / React specifics

- No `any`. If a type is genuinely unknown, use `unknown` and narrow.
- Components are function components. No class components.
- One component per file, named export. Co-located styles only if Tailwind isn't enough (it usually is).
- Imports ordered: react/third-party, `@/` first-party, relative. Auto-managed by Prettier/ESLint.
- Prefer composition over `useEffect`. If you reach for `useEffect`, ask whether Zustand or a derived value would do the job.

### File and function size

- Function over ~50 lines: consider splitting. Not a hard rule — clarity wins.
- File over ~400 lines: probably multiple concerns. Split.
- Module (directory) over ~10 files: probably needs a sub-grouping.

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
- **`.claude/skills/tdd-plan-tests/SKILL.md`** — how new work gets specced
  and tested: triage, spec, stubs, red tests, and the implementation
  manifest (its format lives there). Update only when the workflow changes.
- **`.claude/skills/tdd-implement/SKILL.md`** — how one manifest group gets
  implemented: plan, worktree, ratchet, report. Update only when the
  workflow changes.
- **`design/plans/<feature>.md`** — per-feature implementation manifests
  produced by the workflow. Mechanics only (groups, scopes, status); they
  reference DESIGN.md and never restate it.
- **`design/adding-an-extension.md`** — the mechanics checklist for
  adding an artifact-editor extension. Steps only; every why lives in
  DESIGN.md "Extensions". Update only when the contract or the steps
  change.

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
  revisions. A response the server cut short (`finish_reason: length`) is a
  FAILED request, not a completed one: nothing is persisted from it.
- Deletion is **soft** everywhere (archived flag). The system's ONLY true
  deletes are two interface-only operations. Prune deletes archived units
  only, never configurations, and REQUIRES a fresh export: the repository
  refuses unless an export has happened since the last mutation.
  `exportDatabase` takes a delivery callback and clears that bit only
  AFTER the callback resolves — a cancelled save leaves prune refusing.
  Replace (`replaceDatabase`) wipes the whole database and loads a dump
  wholesale in one atomic transaction; it MUST capture a full pre-wipe
  backup and AWAIT its delivery callback BEFORE the first byte is
  deleted. A rejected delivery touches nothing — no wipe, no store write,
  no dirty bit. The backup is also the return value; its undo is another
  replace. Delivery is a parameter, never a convention: a caller that
  cannot be made to pass one is a caller that will forget.
- `importDatabase` is a MERGE, never a replace. It never overwrites,
  renumbers, or deletes: identical records are skipped, strict prefixes
  fast-forward, and diverged histories are kept BOTH (fresh uuid for units;
  fresh name for configuration lineages, rewriting incoming units'
  configName). Never splice diverged conversations. Wholesale replacement
  exists ONLY as the separate `replaceDatabase` (see the deletion bullet) —
  never as a mode, flag, or fallback of import. See DESIGN.md "Import Is a
  Merge".
- Everything persists in ONE IndexedDB database, exactly three object
  stores: `configurations` (name records: description, artifactType,
  archived), `configurationVersions` (immutable recipes), `units`. Shapes
  are declared in `design/application-schema.yaml`. The only exceptions:
  API keys, the LLM endpoint URL, the device theme preference, and
  per-unit extension layout state (`variorum.ext.<extensionId>.<unitId>`)
  live in localStorage (device state — never in the Zustand store, never
  in an export), as does the per-model token-ratio calibration
  (`variorum.tokenRatio.<modelName>`). Export is a
  full-database dump including archived units and all configuration
  versions.
- `artifactType` lives on the configuration _name_ record — set at
  creation, never edited. Version records contain no mutable fields at
  all; `archived` flags exist only on name records and units.

State management (see DESIGN.md "State Architecture"; the repository's
surface is `design/repository-api.ts`):

- ONE Zustand store, hydrated from IndexedDB once at boot. The repository
  module is the ONLY code that writes IndexedDB and the ONLY code that
  updates the store. Write order: IndexedDB `put` first, then store update.
- The IndexedDB wrapper is hand-written
  (open/getAll/put/putMany/clearAndPutMany/deleteByKey only). Do NOT
  introduce Redux, React Query, Dexie, idb, or any other state or storage
  library.
- Configuration draft state is component-local only — never in the Zustand
  store, never persisted, never in a request.
- Streaming chat state lives in the AI SDK's `useChat`; it is committed to
  the unit via the repository only when a response completes.
- The request context is exactly the unit's persisted message history
  (reasoning stripped) plus the config's system prompt. Synthetic context
  — e.g. the manual-edit notice — is persisted as a real message BEFORE
  the request is built; nothing is ever spliced into a request that is
  not in the record.

LLM tool surface:

- The LLM's tool list and the interface's function list are different by
  design. The model gets ONLY: create unit, load unit, list units (active
  only), and `archive_conversation` (human-confirmation gated). It must never
  see archived units.
- The model NEVER gets tools for: export, import, replace, prune, restore, or any
  read/write access to configurations. Configurations contain the system
  prompt — model write access would let prompt injection persist itself.
- Never name a model-facing tool with "delete" semantics; archiving is the
  strongest verb the model holds.

## Development workflow

- All new capabilities and system-wide properties follow the two-skill TDD
  workflow. `/tdd-plan-tests` (`.claude/skills/tdd-plan-tests/SKILL.md`)
  produces the spec delta, interface stubs, red tests, and an
  implementation manifest in `design/plans/`; `/tdd-implement`
  (`.claude/skills/tdd-implement/SKILL.md`) implements exactly ONE manifest
  group per run, in a git worktree. The human orchestrates: runs groups one
  at a time, reviews, commits, merges. STOP GATES in both skills are
  mandatory — a planning run never writes implementation code, and an
  implementation run never starts before its plan is approved.
- Definition of done:
  `npm run typecheck && npx vitest run && npx playwright test` — all green.
- Tests are the spec. NEVER modify a test to make it pass in the same
  session that implements the code under test. A locked test changes only
  through a human-approved spec amendment (spec first, then the test),
  recorded in the feature's manifest.
- Harness: Vitest, node environment (fake-indexeddb for repository tests)
  for the inner loop; Playwright in real Chromium for acceptance — one spec
  per hard invariant touched. No jsdom tests for CSS or visual behavior.

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
- File IO — `Blob`, `URL.createObjectURL`, anchor `download`,
  `showSaveFilePicker`, `input[type=file]` — lives ONLY in
  `src/components/dialogs/file-io.ts`. The domain and the repository never
  see a `File`: they trade `DatabaseDump` objects and strings. Dump text is
  produced and parsed in `src/domain/dump-file.ts`, which does no IO.
- Never name a file `idb` — an npm library has that name; the wrapper is
  `indexed-db-wrapper.ts`.
- Extensions (`src/extensions/`, see DESIGN.md "Extensions"): an extension
  imports ONLY React, its own libraries, and `extension.ts` — never the
  store, the repository, or other components. The host imports extensions
  only via `registry.ts`. Every extension component is `React.lazy`. The
  extension contract gains a field only when a SECOND consumer needs it.
- Don't add emojis to code, comments, commit messages, or documentation unless explicitly asked.
- Don't run `git commit` or `git push` — I do all commits myself. Leave changes in the working tree and report what changed; draft a commit message only when I ask for one. `git add` only on explicit request.
