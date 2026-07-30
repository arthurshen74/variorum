/**
 * The import-merge algorithm (DESIGN.md "Import Is a Merge") as a PURE
 * function: (local dump, incoming dump) → a plan of records to write plus
 * the report. No IO and no nondeterminism here — the repository executes
 * the plan and supplies the uuid mint. That purity is what makes this the
 * most testable code in the app.
 *
 * The axiom: import never overwrites, never renumbers, never deletes —
 * when histories disagree, it makes room instead.
 *   identical → skip · strict prefix → fast-forward · diverged → keep both
 */
import type {
  Configuration,
  ConfigurationVersion,
  DatabaseDump,
  ImportReport,
  Unit,
} from './types';

/** Suffix separator for minted lineage names: linkml → linkml~2. */
export const RENAME_SEPARATOR = '~';
/** Appended to a kept-both clone's conversationName. */
export const IMPORTED_TAG = ' (imported)';

/** Lowest suffix a landing spot can carry. */
const FIRST_RENAME_SUFFIX = 2;
/** Lineage identity — excluded when comparing recipes across names. */
const VERSION_NAME_FIELD = 'name';

export interface MergePlan {
  /** Name records to write (new names, including renamed lineages). */
  configurations: Configuration[];
  /** Version records to write (fast-forwards and renamed lineages). */
  configurationVersions: ConfigurationVersion[];
  /** Units to write (additions, fast-forwards, kept-both clones). */
  units: Unit[];
  report: ImportReport;
}

/** The dump boundary guards shared by import and replace. Throws on refusal. */
export function assertValidDump(
  localSchemaVersion: number,
  dump: DatabaseDump,
): void {
  if (dump.schemaVersion !== localSchemaVersion) {
    throw new Error(
      `dump schema version ${dump.schemaVersion} does not match local ${localSchemaVersion}`,
    );
  }
  const names = new Set(dump.configurations.map((config) => config.name));
  for (const unit of dump.units) {
    if (!names.has(unit.configName)) {
      throw new Error(
        `dump unit ${unit.id} references configuration ${unit.configName}, absent from the dump`,
      );
    }
  }
}

/** mintUnitId supplies fresh uuids for kept-both clones. */
export function planMerge(
  local: DatabaseDump,
  incoming: DatabaseDump,
  mintUnitId: () => string,
): MergePlan {
  assertValidDump(local.schemaVersion, incoming);

  const plan: MergePlan = {
    configurations: [],
    configurationVersions: [],
    units: [],
    report: {
      configurationsAdded: [],
      configurationsFastForwarded: [],
      lineagesRenamed: [],
      unitsAdded: [],
      unitsFastForwarded: [],
      unitsKeptBoth: [],
      skippedIdentical: 0,
    },
  };

  const rewrites = mergeLineages(lineagesOf(local), lineagesOf(incoming), plan);
  mergeUnits(local.units, incoming.units, rewrites, mintUnitId, plan);
  return plan;
}

// ---------------------------------------------------------------------------
// Comparison primitives
// ---------------------------------------------------------------------------

/**
 * How an incoming history relates to a local one. 'ancestor' means incoming
 * is a strict prefix of local; 'extends' is the reverse.
 */
type Relation = 'identical' | 'ancestor' | 'extends' | 'diverged';

/** Field-by-field equality over flat records; an undefined field is an absent one. */
function sameFields(
  a: object,
  b: object,
  ignored: readonly string[] = [],
): boolean {
  const fields = (record: object): [string, unknown][] =>
    Object.entries(record).filter(
      ([key, value]) => value !== undefined && !ignored.includes(key),
    );
  const left = fields(a);
  const right = new Map<string, unknown>(fields(b));
  return (
    left.length === right.size &&
    left.every(([key, value]) => right.get(key) === value)
  );
}

/** The trichotomy over two append-only arrays, read from the incoming side. */
function relate<T>(
  local: T[],
  incoming: T[],
  same: (a: T, b: T) => boolean,
): Relation {
  for (const [index, item] of local.entries()) {
    const other = incoming[index];
    if (other === undefined) break;
    if (!same(item, other)) return 'diverged';
  }
  if (local.length === incoming.length) return 'identical';
  return incoming.length < local.length ? 'ancestor' : 'extends';
}

/**
 * A unit's two histories reduced to one relation. Prefixed in opposite
 * directions — messages ahead here, artifacts ahead there — is a divergence.
 */
function relateUnits(local: Unit, incoming: Unit): Relation {
  const messages = relate(local.messages, incoming.messages, sameFields);
  const artifacts = relate(local.artifacts, incoming.artifacts, sameFields);
  if (messages === 'identical') return artifacts;
  if (artifacts === 'identical') return messages;
  return messages === artifacts ? messages : 'diverged';
}

const relateRecipes = (
  local: ConfigurationVersion[],
  incoming: ConfigurationVersion[],
): Relation =>
  relate(local, incoming, (a, b) => sameFields(a, b, [VERSION_NAME_FIELD]));

/** The local side already holds everything incoming has: writing is a no-op. */
const isContained = (relation: Relation): boolean =>
  relation === 'identical' || relation === 'ancestor';

// ---------------------------------------------------------------------------
// Lineages
// ---------------------------------------------------------------------------

interface Lineage {
  configuration: Configuration;
  versions: ConfigurationVersion[];
}

/** Group a dump's configuration records by name, versions in 1..N order. */
function lineagesOf(dump: DatabaseDump): Map<string, Lineage> {
  const byName = new Map<string, Lineage>();
  for (const configuration of dump.configurations) {
    byName.set(configuration.name, { configuration, versions: [] });
  }
  for (const version of dump.configurationVersions) {
    byName.get(version.name)?.versions.push(version);
  }
  for (const lineage of byName.values()) {
    lineage.versions.sort((a, b) => a.version - b.version);
  }
  return byName;
}

/** Where a diverged incoming lineage lands, and what that costs in writes. */
type LineageLanding =
  | { name: string; write: 'skip' }
  | { name: string; write: 'fastForward'; have: number }
  | { name: string; write: 'add' };

/**
 * Merges the dump's lineages into the plan. Returns the configName rewrites
 * (incoming name → landing name) that the unit pass must apply.
 */
function mergeLineages(
  localLineages: Map<string, Lineage>,
  incomingLineages: Map<string, Lineage>,
  plan: MergePlan,
): Map<string, string> {
  const rewrites = new Map<string, string>();
  const taken = new Set([...localLineages.keys(), ...incomingLineages.keys()]);

  for (const [name, incoming] of incomingLineages) {
    const local = localLineages.get(name);
    if (!local) {
      addLineage(plan, incoming, name);
      continue;
    }
    const relation = relateRecipes(local.versions, incoming.versions);
    if (isContained(relation)) {
      plan.report.skippedIdentical += 1;
      continue;
    }
    if (relation === 'extends') {
      fastForwardLineage(plan, name, local.versions.length, incoming.versions);
      continue;
    }

    const landing = findLineageLanding(
      incoming.versions,
      familyOf(name, localLineages),
      name,
      taken,
    );
    rewrites.set(name, landing.name);
    plan.report.lineagesRenamed.push({ from: name, to: landing.name });
    if (landing.write === 'skip') {
      plan.report.skippedIdentical += 1;
    } else if (landing.write === 'fastForward') {
      fastForwardLineage(plan, landing.name, landing.have, incoming.versions);
    } else {
      taken.add(landing.name);
      addLineage(plan, incoming, landing.name);
    }
  }
  return rewrites;
}

/** Write a whole lineage under `target` — renamed, never renumbered. */
function addLineage(plan: MergePlan, lineage: Lineage, target: string): void {
  plan.configurations.push({ ...lineage.configuration, name: target });
  plan.configurationVersions.push(
    ...lineage.versions.map((version) => ({ ...version, name: target })),
  );
  plan.report.configurationsAdded.push(target);
}

/** Append incoming's versions past the `have` the landing lineage already holds. */
function fastForwardLineage(
  plan: MergePlan,
  target: string,
  have: number,
  versions: ConfigurationVersion[],
): void {
  const appended = versions
    .slice(have)
    .map((version) => ({ ...version, name: target }));
  plan.configurationVersions.push(...appended);
  plan.report.configurationsFastForwarded.push({
    name: target,
    newVersions: appended.map((version) => version.version),
  });
}

/** Prior landing spots for a base name — base~2, base~3, … in suffix order. */
function familyOf(
  base: string,
  lineages: Map<string, Lineage>,
): { name: string; lineage: Lineage }[] {
  const prefix = base + RENAME_SEPARATOR;
  const members: { name: string; suffix: number; lineage: Lineage }[] = [];
  for (const [name, lineage] of lineages) {
    if (!name.startsWith(prefix)) continue;
    const suffix = Number(name.slice(prefix.length));
    if (Number.isInteger(suffix) && suffix >= FIRST_RENAME_SUFFIX) {
      members.push({ name, suffix, lineage });
    }
  }
  return members.sort((a, b) => a.suffix - b.suffix);
}

/**
 * Minting is the last resort. A diverged lineage first hunts the family of
 * prior landing spots for one that already contains it, then for one it
 * strictly extends (longest common history first, ties to the lowest suffix).
 */
function findLineageLanding(
  versions: ConfigurationVersion[],
  family: { name: string; lineage: Lineage }[],
  base: string,
  taken: Set<string>,
): LineageLanding {
  let longest: { name: string; have: number } | undefined;
  for (const member of family) {
    const relation = relateRecipes(member.lineage.versions, versions);
    if (isContained(relation)) return { name: member.name, write: 'skip' };
    const have = member.lineage.versions.length;
    if (relation === 'extends' && (!longest || have > longest.have)) {
      longest = { name: member.name, have };
    }
  }
  if (longest) {
    return { name: longest.name, write: 'fastForward', have: longest.have };
  }
  return { name: mintLineageName(base, taken), write: 'add' };
}

/** Smallest free base~K, K ≥ 2, against every name the merge can see. */
function mintLineageName(base: string, taken: Set<string>): string {
  for (let suffix = FIRST_RENAME_SUFFIX; ; suffix += 1) {
    const candidate = `${base}${RENAME_SEPARATOR}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/** Where a diverged incoming unit lands. */
type UnitLanding =
  | { write: 'skip' }
  | { write: 'fastForward'; unit: Unit }
  | { write: 'clone' };

function mergeUnits(
  localUnits: Unit[],
  incomingUnits: Unit[],
  rewrites: Map<string, string>,
  mintUnitId: () => string,
  plan: MergePlan,
): void {
  const localById = new Map(localUnits.map((unit) => [unit.id, unit]));

  for (const incoming of incomingUnits) {
    const configName = rewrites.get(incoming.configName) ?? incoming.configName;
    const local = localById.get(incoming.id);
    if (!local) {
      plan.units.push({ ...incoming, configName });
      plan.report.unitsAdded.push(incoming.id);
      continue;
    }

    const relation = relateUnits(local, incoming);
    if (isContained(relation)) {
      plan.report.skippedIdentical += 1;
      continue;
    }
    // A renamed lineage demotes the fast-forward: the incoming tail carries
    // version tags meaning INCOMING's recipe bytes, and this local unit is
    // bound to the local lineage for life.
    const renamed = configName !== incoming.configName;
    if (relation === 'extends' && !renamed) {
      plan.units.push(historyOf(local, incoming));
      plan.report.unitsFastForwarded.push(local.id);
      continue;
    }

    const landing = findUnitLanding(incoming, localUnits, configName);
    if (landing.write === 'skip') {
      plan.report.skippedIdentical += 1;
    } else if (landing.write === 'fastForward') {
      plan.units.push(historyOf(landing.unit, incoming));
      plan.report.unitsFastForwarded.push(landing.unit.id);
    } else {
      const cloneId = mintUnitId();
      plan.units.push({
        ...incoming,
        id: cloneId,
        configName,
        conversationName: incoming.conversationName + IMPORTED_TAG,
      });
      plan.report.unitsKeptBoth.push({ originalId: incoming.id, cloneId });
    }
  }
}

/** The local unit carrying incoming's longer history; local metadata wins. */
const historyOf = (local: Unit, incoming: Unit): Unit => ({
  ...local,
  messages: incoming.messages,
  artifacts: incoming.artifacts,
});

/**
 * The unit form of the landing-spot guard: prior clones bound to the lineage
 * the incoming unit landed on, preferring one that already contains it, then
 * the longest one it strictly extends (ties to the lowest uuid).
 */
function findUnitLanding(
  incoming: Unit,
  localUnits: Unit[],
  configName: string,
): UnitLanding {
  const family = localUnits
    .filter((unit) => unit.configName === configName)
    .sort((a, b) => a.id.localeCompare(b.id));

  let longest: { unit: Unit; have: number } | undefined;
  for (const candidate of family) {
    const relation = relateUnits(candidate, incoming);
    if (isContained(relation)) return { write: 'skip' };
    const have = candidate.messages.length + candidate.artifacts.length;
    if (relation === 'extends' && (!longest || have > longest.have)) {
      longest = { unit: candidate, have };
    }
  }
  return longest
    ? { write: 'fastForward', unit: longest.unit }
    : { write: 'clone' };
}
