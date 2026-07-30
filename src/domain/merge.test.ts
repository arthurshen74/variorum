/**
 * The spec for planMerge (DESIGN.md "Import Is a Merge", including
 * "Settled edges"). Pure-function tests: fixed timestamps, a deterministic
 * uuid mint, exact plan assertions. Locked — changes only via a
 * human-approved spec amendment recorded in the feature manifest.
 */
import { describe, expect, it } from 'vitest';
import type {
  Artifact,
  Configuration,
  ConfigurationVersion,
  DatabaseDump,
  ImportReport,
  Message,
  Unit,
} from './types';
import { SCHEMA_VERSION } from './types';
import type { MergePlan } from './merge';
import { IMPORTED_TAG, planMerge } from './merge';

const T = '2026-01-01T00:00:00.000Z';

interface Lineage {
  configuration: Configuration;
  versions: ConfigurationVersion[];
}

const config = (
  name: string,
  overrides: Partial<Configuration> = {},
): Configuration => ({ name, artifactType: 'yaml', archived: false, ...overrides });

const version = (
  name: string,
  v: number,
  prompt: string,
): ConfigurationVersion => ({
  name,
  version: v,
  modelName: 'test-model',
  systemPrompt: prompt,
});

const lineage = (
  name: string,
  prompts: string[],
  overrides: Partial<Configuration> = {},
): Lineage => ({
  configuration: config(name, overrides),
  versions: prompts.map((p, i) => version(name, i + 1, p)),
});

const message = (content: string, configVersion = 1): Message => ({
  role: 'user',
  configVersion,
  sentAt: T,
  content,
});

const artifact = (v: number, content: string): Artifact => ({
  version: v,
  savedAt: T,
  source: 'manual',
  content,
});

const unit = (
  id: string,
  configName: string,
  overrides: Partial<Unit> = {},
): Unit => ({
  id,
  conversationName: `conversation ${id}`,
  configName,
  createdAt: T,
  archived: false,
  messages: [],
  artifacts: [],
  ...overrides,
});

const db = (lineages: Lineage[], units: Unit[] = []): DatabaseDump => ({
  schemaVersion: SCHEMA_VERSION,
  configurations: lineages.map((l) => l.configuration),
  configurationVersions: lineages.flatMap((l) => l.versions),
  units,
});

const mint = (): (() => string) => {
  let n = 0;
  return () => {
    n += 1;
    return `minted-${n}`;
  };
};

const NO_REPORT: ImportReport = {
  configurationsAdded: [],
  configurationsFastForwarded: [],
  lineagesRenamed: [],
  unitsAdded: [],
  unitsFastForwarded: [],
  unitsKeptBoth: [],
  skippedIdentical: 0,
};

/** Merge two dumps of units under one identical single-version lineage. */
const unitMerge = (localUnits: Unit[], incomingUnits: Unit[]): MergePlan =>
  planMerge(
    db([lineage('cfg', ['base'])], localUnits),
    db([lineage('cfg', ['base'])], incomingUnits),
    mint(),
  );

/** Replay a plan onto a dump (replace-or-append by key), for idempotency tests. */
const applyPlan = (local: DatabaseDump, plan: MergePlan): DatabaseDump => {
  const byKey = <T,>(
    existing: T[],
    incoming: T[],
    key: (x: T) => string,
  ): T[] => {
    const m = new Map(existing.map((x) => [key(x), x]));
    for (const x of incoming) {
      m.set(key(x), x);
    }
    return [...m.values()];
  };
  return {
    schemaVersion: local.schemaVersion,
    configurations: byKey(local.configurations, plan.configurations, (c) => c.name),
    configurationVersions: byKey(
      local.configurationVersions,
      plan.configurationVersions,
      (v) => `${v.name}.${v.version}`,
    ),
    units: byKey(local.units, plan.units, (u) => u.id),
  };
};

describe('[G1] planMerge', () => {
  describe('boundary', () => {
    it('throws on schemaVersion mismatch', () => {
      const incoming = { ...db([]), schemaVersion: SCHEMA_VERSION + 1 };
      expect(() => planMerge(db([]), incoming, mint())).toThrow(/schema/i);
    });

    it('throws when an incoming unit references a configName absent from the dump', () => {
      const incoming = db([], [unit('u1', 'ghost')]);
      expect(() => planMerge(db([]), incoming, mint())).toThrow(/ghost/);
    });

    it('empty dump merges to an empty plan and an all-zero report', () => {
      const local = db([lineage('linkml', ['p1'])], [unit('u1', 'linkml')]);
      const plan = planMerge(local, db([]), mint());
      expect(plan.configurations).toEqual([]);
      expect(plan.configurationVersions).toEqual([]);
      expect(plan.units).toEqual([]);
      expect(plan.report).toEqual(NO_REPORT);
    });

    it('import into an empty database adds everything (restore)', () => {
      const a = lineage('linkml', ['p1', 'p2']);
      const b = lineage('react', ['q1'], { archived: true, description: 'notes' });
      const u = unit('u1', 'linkml', {
        archived: true,
        messages: [message('hi')],
      });
      const plan = planMerge(db([]), db([a, b], [u]), mint());
      expect(
        [...plan.configurations].sort((x, y) => x.name.localeCompare(y.name)),
      ).toEqual([a.configuration, b.configuration]);
      expect(
        [...plan.configurationVersions].sort(
          (x, y) => x.name.localeCompare(y.name) || x.version - y.version,
        ),
      ).toEqual([...a.versions, ...b.versions]);
      expect(plan.units).toEqual([u]);
      expect([...plan.report.configurationsAdded].sort()).toEqual([
        'linkml',
        'react',
      ]);
      expect(plan.report.unitsAdded).toEqual(['u1']);
      expect(plan.report.skippedIdentical).toBe(0);
      expect(plan.report.lineagesRenamed).toEqual([]);
      expect(plan.report.unitsKeptBoth).toEqual([]);
    });
  });

  describe('lineage trichotomy', () => {
    it('unknown configuration name is added whole', () => {
      const b = lineage('b', ['q1', 'q2']);
      const plan = planMerge(db([lineage('a', ['p1'])]), db([b]), mint());
      expect(plan.configurations).toEqual([b.configuration]);
      expect(plan.configurationVersions).toEqual(b.versions);
      expect(plan.report).toEqual({ ...NO_REPORT, configurationsAdded: ['b'] });
    });

    it('byte-identical lineage is skipped', () => {
      const plan = planMerge(
        db([lineage('a', ['p1', 'p2'])]),
        db([lineage('a', ['p1', 'p2'])]),
        mint(),
      );
      expect(plan.configurations).toEqual([]);
      expect(plan.configurationVersions).toEqual([]);
      expect(plan.report).toEqual({ ...NO_REPORT, skippedIdentical: 1 });
    });

    it('metadata-only lineage difference skips and leaves local metadata untouched', () => {
      const plan = planMerge(
        db([lineage('a', ['p1'], { description: 'mine', archived: false })]),
        db([lineage('a', ['p1'], { description: 'theirs', archived: true })]),
        mint(),
      );
      expect(plan.configurations).toEqual([]);
      expect(plan.report).toEqual({ ...NO_REPORT, skippedIdentical: 1 });
    });

    it('incoming ancestor lineage is skipped, not fast-forwarded', () => {
      const plan = planMerge(
        db([lineage('a', ['p1', 'p2', 'p3'])]),
        db([lineage('a', ['p1', 'p2'])]),
        mint(),
      );
      expect(plan.configurationVersions).toEqual([]);
      expect(plan.report).toEqual({ ...NO_REPORT, skippedIdentical: 1 });
    });

    it('local-prefix lineage fast-forwards with only the new versions', () => {
      const plan = planMerge(
        db([lineage('a', ['p1', 'p2'])]),
        db([lineage('a', ['p1', 'p2', 'p3', 'p4'])]),
        mint(),
      );
      expect(plan.configurations).toEqual([]);
      expect(plan.configurationVersions).toEqual([
        version('a', 3, 'p3'),
        version('a', 4, 'p4'),
      ]);
      expect(plan.report).toEqual({
        ...NO_REPORT,
        configurationsFastForwarded: [{ name: 'a', newVersions: [3, 4] }],
      });
    });

    it('diverged lineage is copied whole under a fresh ~2 name', () => {
      const plan = planMerge(
        db([lineage('linkml', ['p1', 'p2', 'p3', 'local4'])]),
        db([lineage('linkml', ['p1', 'p2', 'p3', 'inc4', 'inc5'])]),
        mint(),
      );
      expect(plan.configurations).toEqual([config('linkml~2')]);
      expect(plan.configurationVersions).toEqual([
        version('linkml~2', 1, 'p1'),
        version('linkml~2', 2, 'p2'),
        version('linkml~2', 3, 'p3'),
        version('linkml~2', 4, 'inc4'),
        version('linkml~2', 5, 'inc5'),
      ]);
      expect(plan.report).toEqual({
        ...NO_REPORT,
        configurationsAdded: ['linkml~2'],
        lineagesRenamed: [{ from: 'linkml', to: 'linkml~2' }],
      });
    });

    it('rename bumps past a locally taken name', () => {
      const plan = planMerge(
        db([
          lineage('linkml', ['p1', 'localTail']),
          lineage('linkml~2', ['unrelated']),
        ]),
        db([lineage('linkml', ['p1', 'incomingTail'])]),
        mint(),
      );
      expect(plan.report.lineagesRenamed).toEqual([
        { from: 'linkml', to: 'linkml~3' },
      ]);
      expect(plan.configurations).toEqual([config('linkml~3')]);
      expect(plan.configurationVersions).toEqual([
        version('linkml~3', 1, 'p1'),
        version('linkml~3', 2, 'incomingTail'),
      ]);
    });

    it('rename bumps past dump names and names minted earlier in the same merge', () => {
      const plan = planMerge(
        db([lineage('a', ['p1', 'localTail'])]),
        db([lineage('a', ['p1', 'incomingTail']), lineage('a~2', ['other'])]),
        mint(),
      );
      expect(plan.report.lineagesRenamed).toEqual([{ from: 'a', to: 'a~3' }]);
      expect([...plan.report.configurationsAdded].sort()).toEqual([
        'a~2',
        'a~3',
      ]);
    });

    it('suffixed incoming name renames on the opaque base', () => {
      const plan = planMerge(
        db([lineage('linkml~2', ['p1', 'localTail'])]),
        db([lineage('linkml~2', ['p1', 'incomingTail'])]),
        mint(),
      );
      expect(plan.report.lineagesRenamed).toEqual([
        { from: 'linkml~2', to: 'linkml~2~2' },
      ]);
    });
  });

  describe('lineage landing-spot guard', () => {
    it('identical family member captures the divergence as a skip', () => {
      const newUnit = unit('u1', 'linkml', { messages: [message('hi')] });
      const plan = planMerge(
        db([
          lineage('linkml', ['p1', 'local2']),
          lineage('linkml~2', ['p1', 'inc2', 'inc3']),
        ]),
        db([lineage('linkml', ['p1', 'inc2', 'inc3'])], [newUnit]),
        mint(),
      );
      expect(plan.configurations).toEqual([]);
      expect(plan.configurationVersions).toEqual([]);
      expect(plan.report.configurationsAdded).toEqual([]);
      expect(plan.report.lineagesRenamed).toEqual([
        { from: 'linkml', to: 'linkml~2' },
      ]);
      expect(plan.report.skippedIdentical).toBe(1);
      // the reused name is the rewrite target
      expect(plan.units).toEqual([{ ...newUnit, configName: 'linkml~2' }]);
      expect(plan.report.unitsAdded).toEqual(['u1']);
    });

    it('family member containing incoming as strict prefix captures as a skip', () => {
      const plan = planMerge(
        db([
          lineage('linkml', ['p1', 'local2']),
          lineage('linkml~2', ['p1', 'inc2', 'inc3', 'later4']),
        ]),
        db([lineage('linkml', ['p1', 'inc2', 'inc3'])]),
        mint(),
      );
      expect(plan.configurationVersions).toEqual([]);
      expect(plan.report).toEqual({
        ...NO_REPORT,
        skippedIdentical: 1,
        lineagesRenamed: [{ from: 'linkml', to: 'linkml~2' }],
      });
    });

    it('family member strictly extended by incoming fast-forwards', () => {
      const plan = planMerge(
        db([
          lineage('linkml', ['p1', 'local2']),
          lineage('linkml~2', ['p1', 'inc2']),
        ]),
        db([lineage('linkml', ['p1', 'inc2', 'inc3', 'inc4'])]),
        mint(),
      );
      expect(plan.configurations).toEqual([]);
      expect(plan.configurationVersions).toEqual([
        version('linkml~2', 3, 'inc3'),
        version('linkml~2', 4, 'inc4'),
      ]);
      expect(plan.report).toEqual({
        ...NO_REPORT,
        configurationsFastForwarded: [
          { name: 'linkml~2', newVersions: [3, 4] },
        ],
        lineagesRenamed: [{ from: 'linkml', to: 'linkml~2' }],
      });
    });

    it('a skip candidate beats a fast-forward candidate', () => {
      const plan = planMerge(
        db([
          lineage('linkml', ['p1', 'local2']),
          lineage('linkml~2', ['p1', 'inc2']),
          lineage('linkml~3', ['p1', 'inc2', 'inc3']),
        ]),
        db([lineage('linkml', ['p1', 'inc2', 'inc3'])]),
        mint(),
      );
      expect(plan.configurationVersions).toEqual([]);
      expect(plan.report).toEqual({
        ...NO_REPORT,
        skippedIdentical: 1,
        lineagesRenamed: [{ from: 'linkml', to: 'linkml~3' }],
      });
    });

    it('longest common history wins among fast-forward candidates, ties to lowest suffix', () => {
      const incoming = db([lineage('linkml', ['p1', 'inc2', 'inc3', 'inc4'])]);
      const longest = planMerge(
        db([
          lineage('linkml', ['p1', 'local2']),
          lineage('linkml~2', ['p1', 'inc2']),
          lineage('linkml~3', ['p1', 'inc2', 'inc3']),
        ]),
        incoming,
        mint(),
      );
      expect(longest.configurationVersions).toEqual([
        version('linkml~3', 4, 'inc4'),
      ]);
      expect(longest.report.lineagesRenamed).toEqual([
        { from: 'linkml', to: 'linkml~3' },
      ]);

      const tie = planMerge(
        db([
          lineage('linkml', ['p1', 'local2']),
          lineage('linkml~2', ['p1', 'inc2']),
          lineage('linkml~3', ['p1', 'inc2']),
        ]),
        incoming,
        mint(),
      );
      expect(tie.report.lineagesRenamed).toEqual([
        { from: 'linkml', to: 'linkml~2' },
      ]);
      expect(tie.configurationVersions).toEqual([
        version('linkml~2', 3, 'inc3'),
        version('linkml~2', 4, 'inc4'),
      ]);
    });

    it('fresh mint only when every family member diverges', () => {
      const plan = planMerge(
        db([
          lineage('linkml', ['p1', 'local2']),
          lineage('linkml~2', ['p1', 'other2']),
        ]),
        db([lineage('linkml', ['p1', 'inc2'])]),
        mint(),
      );
      expect(plan.report.lineagesRenamed).toEqual([
        { from: 'linkml', to: 'linkml~3' },
      ]);
      expect(plan.configurations).toEqual([config('linkml~3')]);
    });
  });

  describe('unit trichotomy', () => {
    it('unknown unit id is added with incoming metadata unchanged', () => {
      const u = unit('u1', 'cfg', {
        conversationName: 'Theirs',
        archived: true,
        messages: [message('hi')],
      });
      const plan = unitMerge([], [u]);
      expect(plan.units).toEqual([u]);
      expect(plan.report.unitsAdded).toEqual(['u1']);
    });

    it('byte-identical unit is skipped', () => {
      const u = unit('u1', 'cfg', {
        messages: [message('hi')],
        artifacts: [artifact(1, 'A')],
      });
      const plan = unitMerge([u], [{ ...u }]);
      expect(plan.units).toEqual([]);
      // the shared cfg lineage skips too
      expect(plan.report).toEqual({ ...NO_REPORT, skippedIdentical: 2 });
    });

    it('metadata-only unit difference skips and leaves local metadata untouched', () => {
      const payload = {
        messages: [message('hi')],
        artifacts: [artifact(1, 'A')],
      };
      const plan = unitMerge(
        [unit('u1', 'cfg', { ...payload, conversationName: 'Mine', archived: false })],
        [unit('u1', 'cfg', { ...payload, conversationName: 'Theirs', archived: true })],
      );
      expect(plan.units).toEqual([]);
      expect(plan.report.skippedIdentical).toBe(2);
    });

    it('incoming ancestor unit is skipped', () => {
      const m = [message('one'), message('two'), message('three')];
      const plan = unitMerge(
        [unit('u1', 'cfg', { messages: m })],
        [unit('u1', 'cfg', { messages: m.slice(0, 2) })],
      );
      expect(plan.units).toEqual([]);
      expect(plan.report.unitsFastForwarded).toEqual([]);
      expect(plan.report.skippedIdentical).toBe(2);
    });

    it('clean-prefix longer incoming unit fast-forwards keeping local metadata', () => {
      const m = [message('one'), message('two'), message('three'), message('four')];
      const arts = [artifact(1, 'A')];
      const local = unit('u1', 'cfg', {
        conversationName: 'Mine',
        archived: true,
        messages: m.slice(0, 2),
        artifacts: arts,
      });
      const incoming = unit('u1', 'cfg', {
        conversationName: 'Theirs',
        archived: false,
        messages: m,
        artifacts: arts,
      });
      const plan = unitMerge([local], [incoming]);
      expect(plan.units).toEqual([{ ...local, messages: m, artifacts: arts }]);
      expect(plan.report.unitsFastForwarded).toEqual(['u1']);
    });

    it('manual-save edge: equal messages with longer incoming artifacts fast-forwards', () => {
      const m = [message('one')];
      const local = unit('u1', 'cfg', {
        messages: m,
        artifacts: [artifact(1, 'A')],
      });
      const incoming = unit('u1', 'cfg', {
        messages: m,
        artifacts: [artifact(1, 'A'), artifact(2, 'B')],
      });
      const plan = unitMerge([local], [incoming]);
      expect(plan.units).toEqual([{ ...local, artifacts: incoming.artifacts }]);
      expect(plan.report.unitsFastForwarded).toEqual(['u1']);
    });

    it('manual-save edge: equal artifacts with longer incoming messages fast-forwards', () => {
      const arts = [artifact(1, 'A')];
      const local = unit('u1', 'cfg', {
        messages: [message('one')],
        artifacts: arts,
      });
      const incoming = unit('u1', 'cfg', {
        messages: [message('one'), message('two')],
        artifacts: arts,
      });
      const plan = unitMerge([local], [incoming]);
      expect(plan.units).toEqual([{ ...local, messages: incoming.messages }]);
      expect(plan.report.unitsFastForwarded).toEqual(['u1']);
    });

    it('mixed prefix directions across the two arrays diverges', () => {
      const local = unit('u1', 'cfg', {
        messages: [message('one')],
        artifacts: [artifact(1, 'A'), artifact(2, 'localB')],
      });
      const incoming = unit('u1', 'cfg', {
        messages: [message('one'), message('two')],
        artifacts: [artifact(1, 'A')],
      });
      const plan = unitMerge([local], [incoming]);
      expect(plan.report.unitsFastForwarded).toEqual([]);
      expect(plan.report.unitsKeptBoth).toEqual([
        { originalId: 'u1', cloneId: 'minted-1' },
      ]);
      expect(plan.units).toEqual([
        {
          ...incoming,
          id: 'minted-1',
          conversationName: incoming.conversationName + IMPORTED_TAG,
        },
      ]);
    });

    it('diverged unit clones under a minted uuid with tagged conversationName', () => {
      const local = unit('u1', 'cfg', {
        messages: [message('one'), message('local two')],
      });
      const incoming = unit('u1', 'cfg', {
        conversationName: 'Draft',
        messages: [message('one'), message('incoming two')],
      });
      const plan = unitMerge([local], [incoming]);
      expect(plan.units).toEqual([
        { ...incoming, id: 'minted-1', conversationName: `Draft${IMPORTED_TAG}` },
      ]);
      expect(plan.report.unitsKeptBoth).toEqual([
        { originalId: 'u1', cloneId: 'minted-1' },
      ]);
    });

    it('clone carries incoming archived flag and post-rewrite configName', () => {
      const incomingUnit = unit('u1', 'linkml', {
        archived: true,
        messages: [message('one'), message('inc two')],
      });
      const plan = planMerge(
        db(
          [lineage('linkml', ['p1', 'local2'])],
          [unit('u1', 'linkml', { messages: [message('one'), message('local two')] })],
        ),
        db([lineage('linkml', ['p1', 'inc2'])], [incomingUnit]),
        mint(),
      );
      expect(plan.units).toEqual([
        {
          ...incomingUnit,
          id: 'minted-1',
          configName: 'linkml~2',
          conversationName: incomingUnit.conversationName + IMPORTED_TAG,
        },
      ]);
    });

    it('added units of a renamed lineage get configName rewritten', () => {
      const newUnit = unit('u2', 'linkml', { messages: [message('hello')] });
      const plan = planMerge(
        db([lineage('linkml', ['p1', 'local2'])]),
        db([lineage('linkml', ['p1', 'inc2'])], [newUnit]),
        mint(),
      );
      expect(plan.units).toEqual([{ ...newUnit, configName: 'linkml~2' }]);
      expect(plan.report.unitsAdded).toEqual(['u2']);
    });

    it('renamed lineage demotes its unit fast-forward to keep-both', () => {
      const incomingUnit = unit('u1', 'linkml', {
        messages: [message('one'), message('two', 2)],
      });
      const plan = planMerge(
        db(
          [lineage('linkml', ['p1', 'local2'])],
          [unit('u1', 'linkml', { messages: [message('one')] })],
        ),
        db([lineage('linkml', ['p1', 'inc2'])], [incomingUnit]),
        mint(),
      );
      expect(plan.report.unitsFastForwarded).toEqual([]);
      expect(plan.report.unitsKeptBoth).toEqual([
        { originalId: 'u1', cloneId: 'minted-1' },
      ]);
      expect(plan.units).toEqual([
        {
          ...incomingUnit,
          id: 'minted-1',
          configName: 'linkml~2',
          conversationName: incomingUnit.conversationName + IMPORTED_TAG,
        },
      ]);
    });

    it('identical unit under a renamed lineage still skips', () => {
      const u = unit('u1', 'linkml', { messages: [message('one')] });
      const plan = planMerge(
        db([lineage('linkml', ['p1', 'local2'])], [u]),
        db([lineage('linkml', ['p1', 'inc2'])], [{ ...u }]),
        mint(),
      );
      expect(plan.units).toEqual([]);
      expect(plan.report.unitsKeptBoth).toEqual([]);
      // one skip: the unit (the lineage lands in lineagesRenamed, not skips)
      expect(plan.report.skippedIdentical).toBe(1);
    });
  });

  describe('unit landing-spot guard', () => {
    it('prior clone containing the incoming payload captures as a skip', () => {
      const sharedMsgs = [message('one'), message('two', 2)];
      const plan = planMerge(
        db(
          [
            lineage('linkml', ['p1', 'local2']),
            lineage('linkml~2', ['p1', 'inc2']),
          ],
          [
            unit('u1', 'linkml', { messages: [message('one')] }),
            unit('clone-1', 'linkml~2', {
              conversationName: `conversation u1${IMPORTED_TAG}`,
              messages: sharedMsgs,
            }),
          ],
        ),
        db(
          [lineage('linkml', ['p1', 'inc2'])],
          [unit('u1', 'linkml', { messages: sharedMsgs })],
        ),
        mint(),
      );
      expect(plan.units).toEqual([]);
      expect(plan.report.unitsKeptBoth).toEqual([]);
      // both captured: the lineage by linkml~2, the unit by clone-1
      expect(plan.report.skippedIdentical).toBe(2);
    });

    it('incoming extending a prior clone fast-forwards the clone', () => {
      const msgs = [message('one'), message('two', 2), message('three', 2)];
      const clone = unit('clone-1', 'linkml~2', {
        conversationName: `conversation u1${IMPORTED_TAG}`,
        messages: msgs.slice(0, 2),
      });
      const plan = planMerge(
        db(
          [
            lineage('linkml', ['p1', 'local2']),
            lineage('linkml~2', ['p1', 'inc2']),
          ],
          [unit('u1', 'linkml', { messages: [message('one')] }), clone],
        ),
        db(
          [lineage('linkml', ['p1', 'inc2'])],
          [unit('u1', 'linkml', { messages: msgs })],
        ),
        mint(),
      );
      expect(plan.units).toEqual([{ ...clone, messages: msgs }]);
      expect(plan.report.unitsFastForwarded).toEqual(['clone-1']);
      expect(plan.report.unitsKeptBoth).toEqual([]);
    });

    it('the unit guard only matches units bound to the post-rewrite configName', () => {
      const incomingMsgs = [message('one'), message('inc two')];
      const plan = planMerge(
        db(
          [lineage('linkml', ['p1', 'local2']), lineage('cfg', ['base'])],
          [
            unit('u1', 'linkml', {
              messages: [message('one'), message('local two')],
            }),
            // identical payload, but bound to an unrelated lineage
            unit('u9', 'cfg', { messages: incomingMsgs }),
          ],
        ),
        db(
          [lineage('linkml', ['p1', 'inc2'])],
          [unit('u1', 'linkml', { messages: incomingMsgs })],
        ),
        mint(),
      );
      expect(plan.report.unitsKeptBoth).toEqual([
        { originalId: 'u1', cloneId: 'minted-1' },
      ]);
      const clone = plan.units.find((u) => u.id === 'minted-1');
      expect(clone?.configName).toBe('linkml~2');
    });
  });

  describe('determinism, idempotency, and the report', () => {
    it('identical inputs yield deep-equal plans', () => {
      const local = db(
        [lineage('linkml', ['p1', 'local2'])],
        [unit('u1', 'linkml', { messages: [message('one'), message('mine')] })],
      );
      const incoming = db(
        [lineage('linkml', ['p1', 'inc2'])],
        [
          unit('u1', 'linkml', { messages: [message('one'), message('theirs')] }),
          unit('u2', 'linkml'),
        ],
      );
      const first = planMerge(local, incoming, mint());
      const second = planMerge(local, incoming, mint());
      expect(second).toEqual(first);
    });

    it('applying the plan and re-planning the same dump yields an empty plan', () => {
      const local = db(
        [lineage('linkml', ['p1', 'local2']), lineage('ff', ['f1'])],
        [unit('u1', 'linkml', { messages: [message('one'), message('mine')] })],
      );
      const incoming = db(
        [
          lineage('linkml', ['p1', 'inc2']),
          lineage('ff', ['f1', 'f2']),
          lineage('fresh', ['n1']),
        ],
        [
          unit('u1', 'linkml', { messages: [message('one'), message('theirs')] }),
          unit('u2', 'fresh'),
        ],
      );
      const first = planMerge(local, incoming, mint());
      const merged = applyPlan(local, first);
      const second = planMerge(merged, incoming, mint());
      expect(second.configurations).toEqual([]);
      expect(second.configurationVersions).toEqual([]);
      expect(second.units).toEqual([]);
      expect(second.report.configurationsAdded).toEqual([]);
      expect(second.report.configurationsFastForwarded).toEqual([]);
      expect(second.report.unitsAdded).toEqual([]);
      expect(second.report.unitsFastForwarded).toEqual([]);
      expect(second.report.unitsKeptBoth).toEqual([]);
      // the reused landing spot still reports its mapping
      expect(second.report.lineagesRenamed).toEqual([
        { from: 'linkml', to: 'linkml~2' },
      ]);
      // linkml, ff, fresh, u1, u2
      expect(second.report.skippedIdentical).toBe(5);
    });

    it('every incoming entity lands in exactly one report bucket, counted as entities', () => {
      const uSame = unit('uA', 'same', { messages: [message('a')] });
      const local = db(
        [
          lineage('same', ['s1', 's2', 's3']),
          lineage('grow', ['g1']),
          lineage('linkml', ['p1', 'local2']),
        ],
        [
          uSame,
          unit('uC', 'same', { messages: [message('c'), message('mine')] }),
        ],
      );
      const incoming = db(
        [
          lineage('same', ['s1', 's2', 's3']),
          lineage('grow', ['g1', 'g2']),
          lineage('linkml', ['p1', 'inc2']),
          lineage('fresh', ['n1']),
        ],
        [
          { ...uSame },
          unit('uB', 'fresh'),
          unit('uC', 'same', { messages: [message('c'), message('theirs')] }),
        ],
      );
      const plan = planMerge(local, incoming, mint());
      // 'same' lineage (3 versions = ONE entity) + uSame
      expect(plan.report.skippedIdentical).toBe(2);
      expect([...plan.report.configurationsAdded].sort()).toEqual([
        'fresh',
        'linkml~2',
      ]);
      expect(plan.report.configurationsFastForwarded).toEqual([
        { name: 'grow', newVersions: [2] },
      ]);
      expect(plan.report.lineagesRenamed).toEqual([
        { from: 'linkml', to: 'linkml~2' },
      ]);
      expect(plan.report.unitsAdded).toEqual(['uB']);
      expect(plan.report.unitsFastForwarded).toEqual([]);
      expect(plan.report.unitsKeptBoth).toEqual([
        { originalId: 'uC', cloneId: 'minted-1' },
      ]);
    });
  });
});
