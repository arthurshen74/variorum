// repository-api.ts — the repository's public surface.
//
// This file is the SHAPE; DESIGN.md ("State Architecture", "Import Is a
// Merge", "Persistence & Data Model") is the WHY — the same split as
// application-schema.yaml. If a method changes, it changes here and the
// rationale changes there.
//
// Ground rules this API encodes (from DESIGN.md "State Architecture"):
//
//   1. THE REPOSITORY WRITES; THE STORE READS. There are no read methods
//      here. All reads — UI and LLM tool handlers alike — are synchronous
//      selectors over the Zustand store (hydrated once at boot). The LLM's
//      `list` and `load` tools are selector-backed, filtered to active
//      units.
//
//   2. EVERY MUTATION RUNS THROUGH A SERIAL QUEUE. The context that makes
//      this necessary: a unit is stored as ONE document, so "append a
//      message" is really three steps — (a) read the current unit object,
//      (b) build a copy with the message appended, (c) `put` the copy to
//      IndexedDB and update the store. Step (c) is async. JavaScript is
//      single-threaded, but every `await` is a door: while one mutation
//      waits for its `put` to land, the event loop is free to start
//      ANOTHER mutation, which reads the unit as it was BEFORE the first
//      one finished.
//
//      Concrete failure without a queue: the user sends a chat message
//      (mutation A) and, before A's put lands, hits save on a manual edit
//      (mutation B). A reads the unit — 5 messages. B reads the unit —
//      the same 5. A writes its copy: 6 messages. B then writes ITS copy:
//      still 5 messages, plus the new artifact revision. B's write wins
//      because it landed last, and A's message is silently gone. This is
//      the same failure shape as the two-tab scenario DESIGN.md declares a
//      non-goal — but cross-tab the fix is real machinery (Web Locks,
//      BroadcastChannel), while in-tab the fix is one line: the repository
//      keeps an internal promise chain, and every mutation waits for the
//      previous one to fully finish before it reads anything. Writes are
//      human-speed; serializing them costs nothing perceptible.
//
//   3. WRITE ORDER: IndexedDB `put` first (durability), then store update.
//      Nothing else touches either.
//
//   4. The IDB wrapper surface grows by exactly two calls beyond the
//      basics. `putMany`: one transaction spanning both configuration
//      stores, for one caller — createConfiguration — so a crash can
//      never leave a name record without its version 1. `clearAndPutMany`:
//      one transaction that clears ALL three stores and writes a whole
//      dump, for one caller — replaceDatabase — so a crash can never
//      leave half a database. Wrapper total:
//      open/getAll/put/putMany/clearAndPutMany/deleteByKey.
//
// Types mirror application-schema.yaml one-to-one (hand-written for now;
// the schema is the source of truth if they ever disagree).

// ---------------------------------------------------------------------------
// Domain types (mirror application-schema.yaml)
// ---------------------------------------------------------------------------

export type MessageRole = 'user' | 'assistant';
export type ArtifactSource = 'llm' | 'manual';
/** Absent kind = ordinary chat message. */
export type MessageKind = 'editNotice';

export interface Configuration {
  name: string; // PK
  description?: string;
  artifactType: string; // set at creation, never edited
  archived: boolean;
}

export interface ConfigurationVersion {
  name: string; // composite PK half
  version: number; // composite PK half; 1-based, append-only
  modelName: string;
  systemPrompt: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  reasoningEffort?: string;
}

export interface Message {
  role: MessageRole;
  configVersion: number; // + unit.configName = "linkml.4"
  sentAt: string; // ISO datetime
  receivedFinishedAt?: string; // assistant only
  reasoning?: string; // assistant only; never re-sent as request context
  kind?: MessageKind; // editNotice only
  artifactVersion?: number; // editNotice only: the revision designator the notice carries
  content: string;
}

export interface Artifact {
  version: number; // 1-based, append-only, assigned by the repository
  savedAt: string; // ISO datetime
  source: ArtifactSource;
  messageIndex?: number; // when source === 'llm'
  content: string;
}

export interface Unit {
  id: string; // uuid PK
  conversationName: string; // mutable label
  configName: string; // bound at creation, for life
  createdAt: string;
  archived: boolean;
  messages: Message[];
  artifacts: Artifact[]; // oldest first; artifact.version is the designator, never the array index
}

/**
 * What importDatabase did — a merge whose outcome you can't see is a merge
 * you won't trust. See DESIGN.md "Import Is a Merge" for the semantics.
 */
export interface ImportReport {
  /** Configuration names new to this database. */
  configurationsAdded: string[];
  /** Lineages that gained versions from the dump. */
  configurationsFastForwarded: { name: string; newVersions: number[] }[];
  /**
   * Where diverged incoming lineages landed (linkml → linkml~2) — the
   * target either freshly minted or reused from a prior import.
   */
  lineagesRenamed: { from: string; to: string }[];
  /** Unit ids new to this database. */
  unitsAdded: string[];
  /** Unit ids whose local copy was extended (incoming was strictly longer). */
  unitsFastForwarded: string[];
  /** Diverged units cloned in under a fresh uuid, both kept. */
  unitsKeptBoth: { originalId: string; cloneId: string }[];
  /** Records skipped because they were already present, byte-identical. */
  skippedIdentical: number;
}

export interface DatabaseDump {
  schemaVersion: number;
  configurations: Configuration[];
  configurationVersions: ConfigurationVersion[];
  units: Unit[];
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * The content of a configuration draft at the moment of Save — i.e. a
 * ConfigurationVersion minus its identity (name, version). It's a separate
 * type precisely because callers never choose the identity: the repository
 * takes the name as an argument and assigns the version by append. "Draft"
 * is the domain word DESIGN.md already uses: you fiddle with a draft
 * (component-local, unversioned, never in a request); Save hands its
 * content here and mints the next immutable version.
 */
export interface ConfigurationDraft {
  modelName: string;
  systemPrompt: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  reasoningEffort?: string;
}

export interface NewConfigurationInfo {
  name: string;
  description?: string;
  artifactType: string;
}

/**
 * What the chat layer hands back when a streaming response completes.
 * Deliberately OUR type, not the AI SDK's message type: the SDK's shape
 * belongs to Vercel and churns across majors (v4 → v5 reshaped messages
 * entirely); the persistence format belongs to us and must outlive that.
 * The chat layer maps SDK → this in its onFinish handler, and the
 * repository stays SDK-agnostic.
 */
export interface AssistantCompletion {
  content: string;
  reasoning?: string; // separate chain-of-thought, when the model returned it
  sentAt: string; // when the request went out
  receivedFinishedAt: string; // when streaming finished
}

// ---------------------------------------------------------------------------
// The repository
// ---------------------------------------------------------------------------

export interface VariorumRepository {
  /**
   * Open the database (running migrations via onupgradeneeded), getAll the
   * three object stores, hydrate the Zustand store. Called once. Every
   * read after this is a synchronous store selector.
   */
  boot(): Promise<void>;

  // ---- Units ------------------------------------------------------------
  // (createUnit / archiveUnit back the LLM tools create_unit /
  //  archive_conversation. The human-confirmation gate on archiving lives
  //  ABOVE the repository, in the tool-dispatch layer — the repository
  //  never prompts; by the time archiveUnit is called, a human said yes.)

  /**
   * Mints id (uuid) + createdAt, archived: false, empty messages and
   * artifacts. Rejects if configName is unknown or archived.
   */
  createUnit(conversationName: string, configName: string): Promise<Unit>;

  /** conversationName is a label, not an identity — rename freely. */
  renameConversation(unitId: string, conversationName: string): Promise<Unit>;

  /**
   * Appends the user's message. The repository — not the caller — resolves
   * configVersion to the latest SAVED version of the unit's configuration
   * at send time. This is where "generation always uses the latest saved
   * version" is enforced; callers cannot pick a version.
   *
   * If the unit's latest revision has source 'manual' and no edit notice
   * points at it yet (domain/edit-notice.ts decides), an editNotice
   * message is appended immediately BEFORE the user's message, in the
   * same atomic document write (DESIGN.md "Manual edits enter the
   * conversation").
   */
  appendUserMessage(unitId: string, content: string): Promise<Unit>;

  /**
   * One atomic whole-document write when a response completes: appends the
   * assistant message (configVersion resolved same as above) and, if
   * artifactContent is provided (the extractor found a fence), captures an
   * Artifact revision with source 'llm' and messageIndex stitched to the
   * just-appended message. The repository — not the caller — compares
   * artifactContent against the latest revision, whatever its source:
   * equal bytes mint nothing, mirroring saveManualEdit ("a response that
   * changes nothing mints nothing"). Message and revision can never
   * disagree, because they are one `put`.
   */
  completeExchange(
    unitId: string,
    assistant: AssistantCompletion,
    artifactContent?: string,
  ): Promise<Unit>;

  /**
   * Explicit human save of a manual artifact edit → Artifact revision with
   * source 'manual'. No-ops (returns the unit unchanged) if content equals
   * the latest revision — a Save that changes nothing mints nothing.
   */
  saveManualEdit(unitId: string, content: string): Promise<Unit>;

  archiveUnit(unitId: string): Promise<Unit>;
  restoreUnit(unitId: string): Promise<Unit>;

  // ---- Configurations ---------------------------------------------------
  // Interface-only, forever. None of these back an LLM tool, and none ever
  // will (DESIGN.md, "Interface-only, on purpose").

  /**
   * Writes the name record AND version 1 in ONE IndexedDB
   * transaction (the wrapper's putMany) — the only multi-store write in
   * the system. Rejects if the name already exists, archived or not.
   */
  createConfiguration(
    info: NewConfigurationInfo,
    draft: ConfigurationDraft,
  ): Promise<ConfigurationVersion>;

  /**
   * The Save button. Mints version N+1 from the draft's content — always
   * an append, never an edit. Draft state lives in component state until
   * this call; this is the only door it leaves through.
   */
  saveConfigurationVersion(
    name: string,
    draft: ConfigurationDraft,
  ): Promise<ConfigurationVersion>;

  /** description is name-record metadata — mutable, unversioned. */
  updateConfigurationDescription(
    name: string,
    description: string,
  ): Promise<Configuration>;

  archiveConfiguration(name: string): Promise<Configuration>;
  restoreConfiguration(name: string): Promise<Configuration>;

  // ---- Danger zone ------------------------------------------------------
  // Interface-only. The model can never trigger any of these.

  /**
   * Full-database dump: archived units, all versions, everything.
   * `deliver` puts it somewhere durable and is AWAITED before
   * dirtySinceExport clears — a cancelled save leaves the bit set, so
   * prune keeps refusing (DESIGN.md "The Dump Is a File").
   */
  exportDatabase(
    deliver: (dump: DatabaseDump) => Promise<void>,
  ): Promise<DatabaseDump>;

  /**
   * A MERGE, never a replace (decided; DESIGN.md "Import Is a Merge").
   * Never overwrites, never renumbers, never deletes — when histories
   * disagree, import makes room instead. Identical → skip (idempotent);
   * strict prefix → fast-forward; diverged → keep both (fresh uuid for
   * units, fresh name for configuration lineages, with incoming units'
   * configName rewritten). Importing into an empty database IS restore.
   * Wholesale replacement is replaceDatabase, never a mode of this method.
   */
  importDatabase(dump: DatabaseDump): Promise<ImportReport>;

  /**
   * One of the system's two true deletes (the other is replaceDatabase).
   * Deletes ALL archived units; returns how many. Never touches
   * configurations (see DESIGN.md, "Prune"). REQUIRES a fresh export:
   * throws unless exportDatabase has run since the last mutation — the
   * prune dialog runs the export as part of its flow, and this backstop
   * makes the requirement physical rather than polite. A regretted prune
   * is undone by merge-importing the dump just written.
   */
  pruneArchivedUnits(): Promise<number>;

  /**
   * The wholesale door (DESIGN.md "Replace — the wholesale door"): wipe
   * all three stores and load the dump, in ONE transaction — a crash
   * leaves the old database or the new one, never half. Refuses (same
   * guards as import: schemaVersion mismatch, unit referencing a
   * configuration absent from the dump) BEFORE any capture or wipe,
   * leaving database, store, and dirty bit untouched. Captures a full
   * pre-wipe backup and returns it — unconditionally, no way to skip —
   * and AWAITS deliverBackup before the wipe: capture, deliver, then
   * destroy. A rejected delivery propagates and touches nothing. A
   * regretted replace is undone by another replace:
   * replaceDatabase(backup, deliver) restores exactly. Marks
   * dirtySinceExport.
   */
  replaceDatabase(
    dump: DatabaseDump,
    deliverBackup: (backup: DatabaseDump) => Promise<void>,
  ): Promise<DatabaseDump>;
}
