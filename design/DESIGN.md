# Variorum Design Record

This is the single source of truth for Variorum's design and architecture
decisions. The [README](../README.md) summarizes and links here; it does not
restate. If a decision changes, it changes in this file.

For the origin story of several of these decisions, see the
[initial design conversation](initial-chat-with-claude-fable.md) (historical,
never edited).

## Stack

SPA. React / TypeScript (strict) / Tailwind / Vite / shadcn / Vercel AI
Elements. Zustand plus a hand-written IndexedDB wrapper for state and
persistence (see State Architecture below).

## LLM Provider Interface

I'm going with an OpenAI compatible API. Beware of CORS! The idea is that we
are using local models so we can control directly the CORS setup. However, if
you want to connect this to something like OpenRouter, this might be an issue.
If you want to use this project in this way, you should be aware of the issue.

## API Keys

LocalStorage. Be aware of XSS risks here. I will be imposing npm lockfile
discipline for myself but if you are forking this, please be careful. Store
your keys at your own risk.

## UI

So I'm lazy and the team at Vercel did a great job with AI Elements... so, a
shout-out thank you to that team! Come to think of it, thanks to Tailwind also!

The component stack is shadcn/ui plus AI Elements, full stop. **Catalyst was
considered and rejected** — I own Tailwind Plus for life, so the leverage was
tempting, but: AI Elements is built *on* shadcn, so Catalyst would be a
second design system on a second primitive layer (Headless UI next to
Radix), blind to the shadcn CSS-variable tokens that theme everything else;
and Catalyst-derived source in this Apache-2.0 repo would hang a
commercial-license asterisk on "fork until your heart's content." The look
is stealable anyway: the entire theme lives in one file of shadcn tokens
(`src/index.css`) — tune it there.

**First-implementation shell.** Three panes: a collapsible left sidebar
(units, configuration entry points), the artifact pane in the middle, and a
right chat pane that expands or hides. The artifact pane owns a tab strip
from day one (see Extensions). Configuration and all other non-chat
operations are dialogs over the main pane with a close-out X — no routing,
no pages. Chain-of-thought renders in the chat pane (reasoning content
comes back separately; see Configurations), streaming gets animated
feedback, and checkpointing is the revision history the data model already
provides — "restore to revision 3" is a manual save of revision 3's
content, minting a *new* revision, because history is append-only even when
walking backward.

## Theming

The app renders in a light or dark theme. A device-level setting offers
**auto | light | dark**, default **auto**: auto follows the browser's
`prefers-color-scheme` and reacts live if it flips mid-session; light and
dark override it. The preference persists in localStorage
(`variorum.theme`), beside the API keys — it is a *device* preference, not
user data. That placement makes two properties structural rather than
enforced: it can never appear in an export (export dumps the IndexedDB
database, which the theme never touches), and changing it never trips the
dirty-since-export bit that gates prune.

**Mechanism — one place, by decree.** Theming is a property, so it gets a
single mechanism instead of per-feature handling. Every color in the app
comes from the shadcn CSS-variable tokens in `src/index.css`, which
already carries both a light (`:root`) and a dark (`.dark`) block. One
module, `src/state/theme.ts`, owns resolution: it reads the persisted
preference, subscribes to `matchMedia('(prefers-color-scheme: dark)')`
while in auto, and toggles the `dark` class on `document.documentElement`.
No other code ever writes that class. `main.tsx` initializes it before
first render, so there is no light flash on a dark boot.

**Out of the Zustand store, deliberately.** The store is the in-memory
copy of the database, and the repository is its only writer; the theme has
no database presence, so it stays out entirely. The settings control reads
and writes through the theme module directly — the same pattern as the
API-key fields and `transport.ts`.

**The editor pane follows for free — almost.** Extensions may not import
the store or receive a theme prop (the contract grows only on a second
consumer's demand), so the theme reaches CodeMirror the same way it
reaches everything else: CSS variables, which cascade into the extension's
DOM ambiently. The code editor defines its `EditorView.theme` and syntax
`HighlightStyle` in terms of `var(--…)` tokens — chrome from the existing
shadcn tokens, plus a small `--editor-*` token set for syntax colors added
to both blocks of `index.css`. `index.css` remains THE theming file;
extensions stay import-clean.

**Setting surface.** A compact three-way control (auto / light / dark) in
the sidebar footer — a persistent low-stakes toggle, not a dialog.

## Server

Server? Why Server? No server. Not for this. Keeping it simple. Persistence
you say? IndexedDB please (see Persistence & Data Model below). Basta, Zak,
fertig.

The tool talks to `localhost` — a server-side component would be a proxy that
proxies from your machine to your machine. If this ever points at a cloud
provider that refuses browser origins, a thin proxy is the designated
extension point; until then it stays out of the repo.

## Distribution (npm)

Variorum ships on npm as a prebuilt SPA: `npx variorum` starts a tiny
hand-written static file server (`bin/variorum.mjs` — `node:http`, zero
dependencies) that serves the packed `dist/` with an `index.html` SPA
fallback. Three decisions worth recording:

- **A static server is delivery, not a backend.** The "no server" rule
  above forbids an *application* backend — anything that holds state,
  proxies LLM traffic, or owns an API. The bin script does none of that:
  it maps URLs to files in `dist/` and knows nothing about the app it
  serves. It exists only because browsers won't run a module SPA off
  `file://`. Every piece of application logic still lives in the browser;
  the invariant stands.

- **Bind `127.0.0.1`, never `0.0.0.0`.** Nothing about this tool needs to
  be reachable from another machine — the model endpoint is localhost and
  all data lives in the local browser — so the server listens on loopback
  only. Port `5177` by default, `PORT` env to override.

- **The `ignore-scripts` publish gotcha.** `.npmrc` sets
  `ignore-scripts=true` so installs never execute third-party lifecycle
  scripts (see the lockfile discipline in [CLAUDE.md](../CLAUDE.md)). The
  flag is symmetric, though: it also suppresses *our own* lifecycle
  scripts, so `prepublishOnly` — which runs the build — silently does not
  run under `npm publish`, and publishing without a manual `npm run build`
  first packs a stale or missing `dist/`. Hence the bin script's 500
  message ("was the package built before packing?") and the rule: build
  explicitly, then publish. The safety trade is deliberate; the manual
  step is the price.

## Persistence & Data Model

Everything lives in a single IndexedDB database. One database, one export, one
thing to reason about. Configurations (see below) live in that same database
rather than off in localStorage — one persistence layer, one import/export
path.

**Schema.** The exact shapes — the three collections (configurations — name
records, configurationVersions, units) and the inlined Message/Artifact
shapes — are declared in
[application-schema.yaml](application-schema.yaml) (LinkML, naturally). That
file is the shape; this section is the why. Message and Artifact are
identifier-less classes inlined into Unit: shapes, never collections of their
own.

The core record is the **unit**: a conversation plus its artifact. These are
atomic. You cannot delete just the artifact — you delete the unit or you
delete nothing. Every unit is created under exactly one configuration (by
name) and stays bound to it for life — the artifact type can't shift
underneath a revision history.

**Single tab per unit — a declared non-goal.** Atomicity above is not
enforced by discipline; it's structural: a unit is stored as *one document*,
messages and artifacts inlined. There is no way to delete an artifact history
and keep its conversation because there is nothing to delete independently.
The flip side of that bargain: appending one message means read the whole
unit, modify it, write the whole unit back. Open the same unit in two tabs
and each tab runs its own read–modify–write — last write wins, and the losing
tab's message silently vanishes. The mnemonic: **one unit, one document;
every write is the whole document; two writers, last one wins.** Fixing this
would mean either breaking messages into their own store (trading away
structural atomicity, the thing we actually care about) or cross-tab
coordination (Web Locks, BroadcastChannel) — real machinery guarding against
a failure that a single human editing one artifact at a time will essentially
never trigger. So it is deliberately not handled. If you are re-reading this
because a message disappeared: you had the same unit open in two tabs. That's
the trade, and we took it on purpose.

**Revision history.** The artifact within a unit keeps its full revision
history. A new revision is captured each time a completed LLM response changes
the artifact, and each time I explicitly save a manual edit. No debounced
autosave noise, no lost work between snapshots. Revisions carry an explicit
1-based version number, assigned by the repository — array position would
encode the same fact, but a revision's designation shouldn't depend on where
it happens to sit in storage. Like configuration versions, "revision 3" is a
name you can say out loud and trust.

**Soft delete.** "Deleting" a unit never destroys it immediately — it sets an
archived flag. Archived units are invisible to the LLM (they don't appear in
`list` and can't be `load`ed by it) and can be restored through the interface.
The only way data actually ceases to exist is the interface-only _prune
archived conversations_ function.

**Prune — why a true delete is safe to have at all.** Every reference in the
data model points one way: units point at configurations (`configName`),
messages point at configuration versions (`configVersion`). Nothing points
at a unit. The rule that falls out: **you may delete a thing nothing points
at; you may never delete a thing that is pointed at.** Prune deletes only
archived units — leaf documents, messages and artifacts inlined — so it
orphans nothing, dangles nothing, cascades nowhere. The same rule is why
prune must never touch configurations: version records are pointed at by
every response tag, and deleting them would break the reproducibility story
for every surviving unit. Note also that prune is not a storage feature — a
configuration is a prompt and a few floats, and the whole database is
megabytes. Prune exists for *privacy*: "this is truly gone from my disk" is
a right worth keeping over your own database, and without prune the only
true delete would be dropping the entire IndexedDB database in devtools — a
far blunter instrument. So prune stays: interface-only, archived-units-only,
double-gated by the archive step that precedes it, and structurally
incapable of collateral damage.

One more gate: **prune requires a fresh export — requires, not offers.**
The prune dialog runs an export as part of the flow, and the repository
backstops it: `pruneArchivedUnits` refuses unless an export has happened
since the last mutation. A regretted prune is therefore always recoverable
from the dump just written — and because import is a merge, recovery is
just importing that dump: the pruned units come straight back as additions.
The one true delete in the system ships with its own undo.

**Export/import.** Export is a true backup: a versioned JSON dump of the
entire database, archived units and all configuration versions included. If it
hasn't been pruned, it's in the export. Import is a merge, never a replace —
it has its own section below.

## Import Is a Merge

Import never overwrites, never renumbers, never deletes. **When histories
disagree, import makes room instead.** That is the axiom; everything in this
section is that one sentence applied case by case.

Why merge and not replace-all: a replace-all import would silently delete
everything not in the dump — the biggest true delete in the system, bigger
than prune, hiding behind a button labeled "import." Merge-import only ever
adds. It also *subsumes* restore: importing into an empty database is a
merge with nothing to collide with, which is exactly a restore. One
semantic, both use cases. And because every merge decision below uses only
content comparison — never timestamps — nothing depends on trusting wall
clocks across machines.

**The trichotomy.** Every record in the dump lands in exactly one bucket
against its local counterpart (matched by identity: configuration name,
unit id):

1. **Identical** — same identity, same bytes. Skip. This makes import
   idempotent: importing the same dump twice is a no-op.
2. **Fast-forward** — one side is a strict prefix of the other; only one
   side kept going after the common history. Keep the longer. Lossless:
   the shorter is entirely contained in it.
3. **Diverged** — both sides evolved past the common ancestor, differently.
   Keep both: the incoming record comes in under a fresh identity. Nothing
   is lost; a human reconciles by eye later, with the full soft-delete net
   underneath.

### Diverged configuration lineages

Walk both lineages upward from version 1, byte-comparing the recipe payload
(model, prompt, sampling, reasoning effort) at each step — versions are
dense 1..N on both sides, so this is a simple zip. Three exits: incoming
ends first with everything matching → it's an ancestor, import nothing.
Local ends first with everything matching → fast-forward: append incoming's
extra versions (appending versions is exactly what Save does; no existing
tag changes meaning). Or both sides have a version *k* with different
bytes → **diverged.**

Worked example: local `linkml` has versions 1–4, the dump has 1–5, and they
disagree at 4. Incoming cannot occupy the name — `linkml.4` may not mean
two different things — and incoming versions cannot be renumbered, because
incoming messages carry those integers as tags. So make room:

1. **Mint a fresh name** — `linkml~2`, bumping the suffix until free.
   Local always keeps the original name: the local database is home.
2. **Copy the entire incoming lineage, versions 1–5, under the new name —
   including the pre-divergence versions identical to local's.** This is
   what keeps the version integers frozen: an incoming message tagged
   version 2 now dereferences `linkml~2.2`, byte-identical to what
   `linkml.2` meant when that message was generated. Every tag on both
   sides still resolves to exactly the bytes that produced it.
3. **Rewrite `configName`** (`linkml` → `linkml~2`) on incoming units
   only. Local units untouched; incoming units bound to non-diverged
   configurations untouched.

Yes, step 2 duplicates identical early versions. A version is a prompt and
a few floats — already declared a cost not worth counting — and
deduplicating would require renumbering, which is forbidden.

### Diverged units

Units are matched by uuid. "Identical" means byte equality of whole
messages (role, configVersion, timestamps, content) and whole artifacts.

- Same id, byte-identical → skip.
- Same id, one side a strict prefix — messages 1–8 on one side, 1–10 on
  the other, the 8 identical → fast-forward, keep the longer. Only one
  side kept going; nothing diverged.
- Same id, both sides appended past the common prefix — local added 9–10,
  incoming added 9′–12′ → **diverged.** Clone the incoming unit whole
  under a fresh uuid, tag its conversationName ("… (imported)"), keep
  both.

**Do not splice — deliberate, not lazy.** A conversation is not a set of
independent edits: message 9′ was generated by a model whose entire context
was messages 1–8 *and nothing else*. A spliced unit containing 1–8, 9–10,
9′–12′ describes a conversation that never happened, feeding artifact
revisions whose provenance is fiction. A unit is a lab notebook, not a
source file: when two photocopies of a notebook diverge, you keep two
notebooks — you don't paste half-pages together and pretend that experiment
ran. Keep-both yields two complete, internally consistent, *true*
histories (their shared prefix duplicated, again at no meaningful cost).
And cloning a unit can never break anything, because nothing points at
units — the same arrow rule that makes prune safe.

**The manual-save edge.** Fast-forward must check messages AND artifacts,
prefixed in the *same direction*. Manual saves mint artifact revisions
without adding messages, so two sides can have identical messages yet
diverged artifact histories (each saved a different manual edit). Equal on
one array and prefix-in-one-direction on the other is still a
fast-forward; mixed directions, or divergence on either array, means a
diverged unit — keep both.

### Metadata, and the report

Mutable metadata — conversationName, archived flags, a configuration's
description — never blocks a fast-forward and never creates a divergence
by itself. Local wins, always: there is no clock worth trusting, and the
stakes are a label.

`importDatabase` returns an **ImportReport** — what was added, skipped,
fast-forwarded, kept-both, and any renamed lineages — because a merge
whose outcome you can't see is a merge you won't trust.

### Settled edges

The section above, applied to its corner cases — settled with the
implementation, recorded here because each had at least one other
defensible answer:

- **Rename targets.** "Bumping the suffix until free" means: the fresh
  name is `<incoming name>~K` for the smallest K ≥ 2 unused anywhere the
  merge can see — local names, every name in the dump, and names already
  minted by this same merge. The incoming name is an opaque base: a
  `linkml~2` that diverges again renames to `linkml~2~2`, never by
  arithmetic on a suffix a user might legitimately have typed. A
  timestamp suffix was considered and rejected: planMerge is pure and
  clock-free, same-second renames would still need the bump loop, and
  the counter reads better in every picker that outlives the merge.

- **Metadata vs. "same bytes."** The trichotomy compares the immutable
  payload only — a lineage's version recipes, a unit's messages and
  artifacts. Records differing only in mutable metadata (archived,
  description, conversationName) are *identical*: skip, local metadata
  untouched. Incoming metadata is read only when the merge writes a NEW
  record — added lineages and units, kept-both clones — where it rides
  in unchanged, because there is no local counterpart for local-wins to
  defer to.

- **Schema versions.** The merge refuses a dump whose `schemaVersion`
  differs from the local one. Import is a boundary; there is only
  version 1 today, and migration machinery arrives with version 2, not
  before.

- **The report counts entities, not records.** One identical lineage —
  name record plus all its versions — is one skip; one identical unit is
  one. Incoming-is-an-ancestor (local kept going, incoming didn't) is
  also one skip: *fast-forwarded* is reserved for records that actually
  gained history. Every incoming entity lands in exactly one bucket.

- **A renamed lineage demotes its units' fast-forwards to keep-both.**
  The tempting graft: local unit at messages 1–8, incoming at 1–10, a
  clean prefix — but the unit's lineage diverged, so incoming came in as
  `linkml~2`, and messages 9–10 carry version tags that meant *incoming's*
  recipe bytes. Appending them to the local unit — bound to `linkml` for
  life — would re-point those tags at local's diverged bytes: precisely
  the lie the rename exists to prevent. A local unit is modified by
  exactly one merge operation — a clean same-lineage fast-forward — or
  not at all. Skips are exempt: writing nothing moves no tag.

- **Minting is the last resort: divergence first hunts for a lossless
  landing.** Without this, every re-import of a diverged dump would
  make room *again* — a fresh rename, a fresh wave of clones — and
  "importing the same dump twice is a no-op" would be false. So when
  the identity match diverges, the merge scans the family of prior
  landing spots (`linkml~2`, `linkml~3`, … for a lineage; units bound
  to the post-rewrite configName for a unit) with the same comparison
  it always uses: a member that already *contains* the incoming record
  → skip; failing that, a member the incoming record strictly extends
  → fast-forward it; only when every candidate diverges is a fresh
  name or uuid minted. Preference is skip, then fast-forward (longest
  common history first, ties to the lowest suffix / uuid), then mint —
  writes-nothing beats writes-something beats makes-new. The rewrite
  target for the dump's units is whichever name the lineage landed on,
  and `lineagesRenamed` reports the mapping whether minted or reused.

## Configurations

A **configuration** is a named recipe for producing one kind of artifact,
keyed by a short name (`linkml`, `react-component`). It's split across two
records, because some things belong to the *name* and some things belong to
a *version* of the recipe.

The **name record** (one per configuration, keyed by name) holds what never
versions:

- **description** — human-facing: what this configuration is for.
- **artifact type** — e.g. `yaml`, `typescript`. This drives everything
  downstream: which fence language the extractor lifts out of responses, the
  editor mode (syntax highlighting, validation), and the file extension on
  export. Set at creation and never edited — a `linkml` that suddenly emits
  TypeScript isn't a new version, it's a different configuration.
- **archived** — the soft-retirement flag (see "Retiring a configuration").

The **version records** (keyed by name + version) are the recipe proper:

- **model identifier** — which model LM Studio should run. Deliberately
  *inside* the version: swapping qwen for llama changes behavior more
  than any temperature tweak, so it versions like everything else.
- **system prompt**
- **sampling parameters** — temperature, top_p, and top_k (top_k isn't
  standard OpenAI, but LM Studio's `/v1/chat/completions` accepts it).
- **reasoning effort** — stored, but best-effort. As of this writing LM Studio
  ignores `reasoning_effort` on `/v1/chat/completions` (the server's UI
  setting wins) and only honors `reasoning.effort` on the newer `/v1/responses`
  endpoint for gpt-oss models. Reasoning *content* does come back separately
  (`choices.message.reasoning`). So the field rides along in the request and
  works where the server supports it.

The split buys a clean property: a version record contains **no mutable
field at all**. Everything that can change about a configuration —
description, archived — lives on the name record, so "immutable" below means
every byte of a version, with no asterisk.

**Versioning.** Configurations are versioned, and versions are **immutable,
append-only, kept forever**. `linkml.4` means version 4 of the `linkml`
configuration, and it means the same bytes today, next month, and in any
export. You never edit version 4 — you create version 5.

Editing happens in a **draft**: fiddle with the sliders and the prompt all you
like, nothing is versioned until you hit **Save**, which mints the next
immutable version. Generation always runs against the latest *saved* version —
unsaved draft state never reaches a request. This keeps slider-fiddling from
minting a pile of versions nothing ever used, while preserving the rule that
any saved change bumps the version.

**Tagging.** Units and responses both point at configurations, at different
granularities:

- a **unit** is tagged with a configuration *name* at creation (`linkml`),
  permanently;
- each **response** is tagged with the exact configuration *version* that
  produced it (`linkml.4`).

New responses in a unit always use the latest saved version of the unit's
configuration. So a long-lived unit's conversation may span `linkml.2` through
`linkml.7`, and each response tells you precisely which model, prompt, and
sampling produced it. Because versions are immutable and never pruned, that
tag is dereferenceable forever — this is the reproducibility story, and it's
why "keep all versions" costs nothing worth counting (a config is a prompt and
a few floats).

**Retiring a configuration.** Same soft-delete philosophy as units: a
configuration can be archived (the flag on its name record), which hides it
from pickers for new units. Its versions are never destroyed — existing units and response tags keep
resolving. Prune does not touch configurations.

**Interface-only, on purpose.** The model gets no tools that read or write
configurations. Configurations contain the system prompt; if the model could
edit them, a prompt injection in pasted artifact text could rewrite its own
standing instructions for every future conversation — a persistence vector
strictly nastier than archiving a unit. The Save button is a human's button.

## State Architecture

Zustand plus a hand-rolled IndexedDB wrapper. The shape, and the why:

**Hydrate at boot.** The whole database — all three collections — is read
once at startup into a single Zustand store. From then on the store is the
working copy: every read in the app is synchronous, and there are no
per-query loading states, no staleness, no cache invalidation. This is the
sub-5MB dividend: the data fits in memory, so IndexedDB is not a query
engine here, it's a write-behind journal we replay at boot.

**The repository is the only writer.** One module owns all mutation. A write
does two things, in this order: `put` the changed document to IndexedDB
(durability first), then update the store. Nothing else touches either.
This is the one discipline the design demands — it's what keeps the
in-memory copy and the database from ever disagreeing.

**Why Zustand and not nothing.** The LLM tool handlers (create / load /
list / archive) are not React code. Zustand's vanilla store works outside
React, so the tool handlers and the UI read and write the same state with
no bridge. That, plus selector subscriptions with the equality handling
already done right, is what the ~1kb buys.

**The wrapper is deliberately tiny.** Open-with-upgrade (three object
stores), `getAll` per store at boot, single-document `put` per write, and
`delete` by key for prune only. That's the entire surface — on the order of
a hundred lines around a promisified IDBRequest. Single-operation
transactions also dodge IndexedDB's classic trap (a transaction
auto-commits the moment you await anything that isn't an IDB request).

**What stays out of the store.** Configuration *drafts* are component-local
state — never in the store, never persisted — which is how "unsaved draft
state never reaches a request" is enforced physically rather than by
politeness. Streaming chat state belongs to the AI SDK's `useChat` while a
response is in flight; it's committed to the unit (through the repository)
only when the response completes.

**Rejected, with reasons.** Redux — ceremony that buys devtools
time-travel we don't need; revision history is a domain feature here, not a
debugging trick. React Query — a network-shaped tool: staleness,
refetching, and invalidation don't exist for local data that only changes
when we change it. Dexie / idb — fine libraries, but our access pattern
(getAll at boot, whole-document puts) uses so little of IndexedDB that a
dependency wouldn't earn its place in the lockfile.

**The surface.** The repository's methods and their exact contracts are
declared in [repository-api.ts](repository-api.ts) — that file is the
shape, this section is the why: the same split as
[application-schema.yaml](application-schema.yaml).

## Source Layout

The layering rule: everything below `components/` is plain TypeScript with
no React in it, and imports point downward only — components → state / llm
→ persistence → domain. Nothing imports upward; extensions import almost
nothing at all (see Extensions).

```
src/
├── main.tsx                     # await repository.boot() → render
├── App.tsx                      # three-pane shell wiring
├── index.css                    # Tailwind + shadcn tokens — THE theming file
├── domain/                      # pure TS, zero React, zero IO
│   ├── types.ts                 # runtime types mirroring application-schema.yaml
│   ├── extract.ts               # fence extractor: artifactType → lift code block
│   └── merge.ts                 # import-merge, a pure function (the most test-worthy code)
├── persistence/
│   ├── indexed-db-wrapper.ts    # open / getAll / put / putMany / deleteByKey
│   └── repository.ts            # implements VariorumRepository; the serial queue
├── state/
│   ├── store.ts                 # the Zustand store + the dirty-since-export bit
│   └── selectors.ts             # ALL reads
├── llm/
│   ├── transport.ts             # OpenAI-compatible endpoint config; key from localStorage
│   ├── tools.ts                 # the model's four tools; the HITL gate hook
│   └── mapping.ts               # SDK boundary → AssistantCompletion
├── extensions/                  # the plugin surface — see Extensions
│   ├── extension.ts             # the whole contract
│   ├── registry.ts              # ordered ExtensionDefinitions; first applicable = default tab
│   └── code-editor/             # extension zero: the CodeMirror 6 editor
└── components/
    ├── ui/                      # shadcn primitives (generated)
    ├── ai-elements/             # AI Elements components (generated)
    ├── shell/                   # AppShell, Sidebar, ChatPane
    ├── artifact/                # ArtifactPane (tabs, working copy, Save), RevisionHistory
    ├── chat/                    # messages, reasoning (CoT), loaders, tool confirmations
    └── dialogs/                 # Configuration, Export/Import, Prune, ArchiveConfirm
```

Two enforcement tricks worth their weight:

- `repository.ts` declares `implements VariorumRepository` **imported
  straight from [repository-api.ts](repository-api.ts)** (tsconfig path
  alias onto `design/`). The design contract stops being prose that can
  drift — the compiler enforces canon on every build.
- The IndexedDB wrapper is `indexed-db-wrapper.ts`, deliberately verbose:
  there is an npm library called `idb`, and no file in this repo may be
  mistakable for it.

## Extensions

Every artifact editor is an extension — including the plain code editor,
which is deliberately **extension zero**: if the humble textbox has to live
by the same contract as a future LinkML graph editor, the contract stays
honest instead of rotting into special cases the default editor never
exercises.

**The axiom: extensions speak artifact text, and nothing else.** The
canonical form of an artifact is the string — that is what gets revisioned,
exported, merged, and extracted from LLM fences. An extension is a *view*
over that string: the code editor renders it highlighted; a graph editor
parses the YAML into nodes, lets you drag relationships around, and
serializes back to YAML on every change. The consequences are all
deliberate: revisions stay uniform, import-merge never learns that
extensions exist, extensions are swappable mid-unit because they own no
data, and "restore to revision 3" works identically in every tab.
Extension-internal state (zoom, node positions) is ephemeral by decree.

**The contract** (`src/extensions/extension.ts`) is three types, total: an
`ExtensionContext` ({ artifactType, configName }), `EditorProps`
({ content, onChange, readOnly, context }), and an `ExtensionDefinition`
({ id, title, appliesTo(ctx), lazy component }). `appliesTo` is a plain
predicate over context — the code editor says `() => true`; a LinkML graph
editor says `ctx.configName === "linkml"`, or matches on artifactType, or
both. First applicable extension in registry order = the default tab.

**Three rules make "standalone" enforceable rather than aspirational:**

1. Extensions import only React, their own libraries, and `extension.ts` —
   never the store, the repository, or other components. Props in,
   onChange out: an extension physically cannot violate the
   repository-sole-writer rule because it cannot reach the repository.
2. The host imports extensions only through `registry.ts`. ArtifactPane
   renders its tabs from the applicable definitions and knows nothing
   else about any extension.
3. Every extension component is `React.lazy` — heavy libraries load when
   their tab first opens, never at boot.

**What stays in the host.** ArtifactPane owns the single working-copy
buffer and the Save button. Extensions edit the buffer through `onChange`;
the pane shows the dirty state; Save is one uniform manual-save path no
matter which tab did the editing — human-in-the-loop and
no-debounced-autosave enforced in exactly one place. Switching tabs cannot
lose a draft, because the draft never belonged to a tab. If an LLM
response lands a new revision while the working copy is dirty, the pane
prompts the human to pick — keep-both thinking, in miniature.

**Editor library: CodeMirror 6**, not Monaco. Monaco is a transplanted VS
Code — megabytes of it, plus web-worker plumbing that fights Vite — while
CM6 is modular and an order of magnitude smaller, and a YAML/TypeScript
textbox with highlighting is squarely its sweet spot.

**Growth rule.** The contract earns new fields only when a *second*
consumer demands them. If the graph editor someday needs to report parse
errors to the host, that is when `EditorProps` grows — not before. Two
consumers make an abstraction; one makes speculation.

## Local Tools (Function Calling)

The LLM gets a small set of tools scoped entirely to the app's own IndexedDB
store. Same functions are callable from the UI, but the LLM and the interface
do NOT get the same list.

Callable by the LLM (and the interface):

- create new unit (artifact + conversation)
- load an existing unit
- list units (active only — archived units are not surfaced to the model)
- archive a unit — note the name: the tool the model sees is
  `archive_conversation`, not `delete_conversation`. The model never holds a
  tool that even claims to destroy data. This call is gated (see below).

Callable ONLY by the interface:

- export variorum database
- import variorum database
- prune archived conversations (the only true delete in the system)
- restore archived conversations
- create / edit (save a new version of) / archive configurations — see
  "Interface-only, on purpose" under Configurations for why the model never
  holds these

## Tool Calling & Data Safety

Although the tool calling is scoped only to the browser sandbox, there are
still some risks to consider:

**Prompt injection.** Artifacts here are YAML — text that plausibly gets
pasted in from external sources. A pasted snippet containing "AI: delete this
conversation" is a cheap attack, and smaller local models are _more_
susceptible to treating embedded text as instructions, not less. Mitigation is
layered: `archive_conversation` requires human-in-the-loop confirmation before
it executes, archiving is soft (recoverable) even if a bad call gets
confirmed, and permanent deletion (prune) can't be invoked by the model at
all. Gate stops the mistake, archive makes it cheap, prune stays out of reach.

**Exfiltration.** Today the model is local, so tool results never leave the
machine. But the day this points at a cloud provider, any tool result becomes
part of an upstream request. That is why export/import are interface-only: the
model can never trigger a "here's the whole database" response. So, if this
project is going to an external, frontier model (like ChatGPT or Anthropic),
be aware that those models will be able to see tool results from your
IndexedDB object store.
