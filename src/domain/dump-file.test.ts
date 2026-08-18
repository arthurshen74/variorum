/**
 * The structural boundary gate (DESIGN.md "The Dump Is a File"). parseDump
 * narrows untrusted JSON to a DatabaseDump and rebuilds each record from its
 * declared fields; it never judges meaning, which is assertValidDump's job and
 * is locked separately in merge.validation.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  backupFilename,
  exportFilename,
  parseDump,
  serializeDump,
} from './dump-file';
import type { DatabaseDump } from './types';
import { SCHEMA_VERSION } from './types';

const T = '2026-01-01T00:00:00.000Z';

type Json = Record<string, unknown>;

const omit = (obj: Json, key: string): Json => {
  const copy = { ...obj };
  delete copy[key];
  return copy;
};

const cfg = (over: Json = {}): Json => ({
  name: 'linkml',
  artifactType: 'yaml',
  archived: false,
  ...over,
});

const ver = (over: Json = {}): Json => ({
  name: 'linkml',
  version: 1,
  modelName: 'm',
  systemPrompt: 's',
  ...over,
});

const message = (over: Json = {}): Json => ({
  role: 'user',
  configVersion: 1,
  sentAt: T,
  content: 'hello',
  ...over,
});

const artifact = (over: Json = {}): Json => ({
  version: 1,
  savedAt: T,
  source: 'manual',
  content: 'x: 1',
  ...over,
});

const unit = (over: Json = {}): Json => ({
  id: 'u1',
  conversationName: 'c',
  configName: 'linkml',
  createdAt: T,
  archived: false,
  messages: [message()],
  artifacts: [artifact()],
  ...over,
});

/** Valid dump text, with any envelope key overridden. */
const dumpText = (over: Json = {}): string =>
  JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    configurations: [cfg()],
    configurationVersions: [ver()],
    units: [unit()],
    ...over,
  });

const validDump: DatabaseDump = {
  schemaVersion: SCHEMA_VERSION,
  configurations: [{ name: 'linkml', artifactType: 'yaml', archived: false }],
  configurationVersions: [
    { name: 'linkml', version: 1, modelName: 'm', systemPrompt: 's' },
  ],
  units: [
    {
      id: 'u1',
      conversationName: 'c',
      configName: 'linkml',
      createdAt: T,
      archived: false,
      messages: [{ role: 'user', configVersion: 1, sentAt: T, content: 'h' }],
      artifacts: [{ version: 1, savedAt: T, source: 'manual', content: 'x' }],
    },
  ],
};

describe('[G1] serializeDump', () => {
  it('round-trips through parseDump unchanged', () => {
    expect(parseDump(serializeDump(validDump))).toEqual(validDump);
  });

  it('pretty-prints with a two-space indent', () => {
    expect(serializeDump(validDump)).toContain('\n  "schemaVersion"');
  });
});

describe('[G1] filenames', () => {
  // Local-time components, so the expectation holds in any timezone.
  const instant = new Date(2026, 6, 31, 14, 32);

  it('names an export variorum-YYYY-MM-DD-HHMM.json', () => {
    expect(exportFilename(instant)).toBe('variorum-2026-07-31-1432.json');
  });

  it('names a backup variorum-pre-replace-YYYY-MM-DD-HHMM.json', () => {
    expect(backupFilename(instant)).toBe(
      'variorum-pre-replace-2026-07-31-1432.json',
    );
  });

  it('zero-pads single-digit month, day, hour and minute', () => {
    const early = new Date(2026, 0, 5, 9, 7);
    expect(exportFilename(early)).toBe('variorum-2026-01-05-0907.json');
    expect(backupFilename(early)).toBe(
      'variorum-pre-replace-2026-01-05-0907.json',
    );
  });

  it('never collides for the same instant', () => {
    expect(exportFilename(instant)).not.toBe(backupFilename(instant));
  });
});

describe('[G1] parseDump — envelope', () => {
  it('rejects text that is not JSON', () => {
    expect(() => parseDump('not json at all')).toThrow(/not valid JSON/);
  });

  it.each([
    ['an array', '[]'],
    ['a scalar', '42'],
    ['a string', '"dump"'],
    ['null', 'null'],
  ])('rejects a root that is %s', (_label, text) => {
    expect(() => parseDump(text)).toThrow(/must be an object/);
  });

  it('rejects a missing schemaVersion', () => {
    expect(() => parseDump(JSON.stringify({ configurations: [] }))).toThrow(
      /schemaVersion/,
    );
  });

  it('rejects a non-numeric schemaVersion', () => {
    expect(() => parseDump(dumpText({ schemaVersion: '1' }))).toThrow(
      /schemaVersion/,
    );
  });

  it.each(['configurations', 'configurationVersions', 'units'])(
    'rejects a missing %s collection',
    (key) => {
      const full = JSON.parse(dumpText()) as Json;
      expect(() => parseDump(JSON.stringify(omit(full, key)))).toThrow(
        new RegExp(key),
      );
    },
  );

  it.each(['configurations', 'configurationVersions', 'units'])(
    'rejects a non-array %s collection',
    (key) => {
      expect(() => parseDump(dumpText({ [key]: {} }))).toThrow(new RegExp(key));
    },
  );

  it('accepts a dump whose three collections are empty', () => {
    const parsed = parseDump(
      dumpText({ configurations: [], configurationVersions: [], units: [] }),
    );
    expect(parsed).toEqual({
      schemaVersion: SCHEMA_VERSION,
      configurations: [],
      configurationVersions: [],
      units: [],
    });
  });
});

describe('[G1] parseDump — Configuration', () => {
  it.each(['name', 'artifactType', 'archived'])(
    'rejects a configuration missing %s',
    (field) => {
      expect(() =>
        parseDump(dumpText({ configurations: [omit(cfg(), field)] })),
      ).toThrow(new RegExp(field));
    },
  );

  it.each([
    ['name', 42],
    ['artifactType', null],
    ['archived', 'no'],
  ])('rejects a configuration whose %s has the wrong type', (field, value) => {
    expect(() =>
      parseDump(dumpText({ configurations: [cfg({ [field]: value })] })),
    ).toThrow(new RegExp(String(field)));
  });

  it('accepts an absent description', () => {
    const parsed = parseDump(
      dumpText({ configurations: [omit(cfg(), 'description')] }),
    );
    expect(parsed.configurations).toEqual([
      { name: 'linkml', artifactType: 'yaml', archived: false },
    ]);
  });

  it('rejects a non-string description when present', () => {
    expect(() =>
      parseDump(dumpText({ configurations: [cfg({ description: 42 })] })),
    ).toThrow(/description/);
  });
});

describe('[G1] parseDump — ConfigurationVersion', () => {
  it.each(['name', 'version', 'modelName', 'systemPrompt'])(
    'rejects a version record missing %s',
    (field) => {
      expect(() =>
        parseDump(dumpText({ configurationVersions: [omit(ver(), field)] })),
      ).toThrow(new RegExp(field));
    },
  );

  const versionCases: [string, Json, RegExp][] = [
    ['a fractional version', { version: 1.5 }, /version/],
    ['a string version', { version: '1' }, /version/],
    ['a non-string modelName', { modelName: 7 }, /modelName/],
  ];

  it.each(versionCases)('rejects %s', (_label, over, pattern) => {
    expect(() =>
      parseDump(dumpText({ configurationVersions: [ver(over)] })),
    ).toThrow(pattern);
  });

  it('accepts absent sampling parameters and reasoning effort', () => {
    const parsed = parseDump(dumpText({ configurationVersions: [ver()] }));
    expect(parsed.configurationVersions).toEqual([
      { name: 'linkml', version: 1, modelName: 'm', systemPrompt: 's' },
    ]);
  });

  it.each([
    ['temperature', 'hot'],
    ['topP', null],
    ['topK', '3'],
    ['reasoningEffort', 5],
  ])('rejects a %s of the wrong type when present', (field, value) => {
    expect(() =>
      parseDump(dumpText({ configurationVersions: [ver({ [field]: value })] })),
    ).toThrow(new RegExp(String(field)));
  });
});

describe('[G1] parseDump — Unit', () => {
  it.each([
    'id',
    'conversationName',
    'configName',
    'createdAt',
    'archived',
    'messages',
    'artifacts',
  ])('rejects a unit missing %s', (field) => {
    expect(() => parseDump(dumpText({ units: [omit(unit(), field)] }))).toThrow(
      new RegExp(field),
    );
  });

  it.each(['messages', 'artifacts'])(
    'rejects a unit whose %s is not an array',
    (field) => {
      expect(() =>
        parseDump(dumpText({ units: [unit({ [field]: 'nope' })] })),
      ).toThrow(new RegExp(field));
    },
  );

  it('accepts a unit with no messages and no artifacts', () => {
    const parsed = parseDump(
      dumpText({ units: [unit({ messages: [], artifacts: [] })] }),
    );
    expect(parsed.units).toEqual([
      {
        id: 'u1',
        conversationName: 'c',
        configName: 'linkml',
        createdAt: T,
        archived: false,
        messages: [],
        artifacts: [],
      },
    ]);
  });
});

describe('[G1] parseDump — Message', () => {
  const withMessage = (over: Json): string =>
    dumpText({ units: [unit({ messages: [message(over)] })] });

  it.each(['role', 'configVersion', 'sentAt', 'content'])(
    'rejects a message missing %s',
    (field) => {
      expect(() =>
        parseDump(
          dumpText({ units: [unit({ messages: [omit(message(), field)] })] }),
        ),
      ).toThrow(new RegExp(field));
    },
  );

  it('rejects a role outside the union', () => {
    expect(() => parseDump(withMessage({ role: 'system' }))).toThrow(/role/);
  });

  it('accepts an absent receivedFinishedAt', () => {
    expect(() => parseDump(withMessage({}))).not.toThrow();
  });

  it('rejects a non-string receivedFinishedAt when present', () => {
    expect(() => parseDump(withMessage({ receivedFinishedAt: 0 }))).toThrow(
      /receivedFinishedAt/,
    );
  });
});

describe('[G1] parseDump — Artifact', () => {
  const withArtifact = (over: Json): string =>
    dumpText({ units: [unit({ artifacts: [artifact(over)] })] });

  it.each(['version', 'savedAt', 'source', 'content'])(
    'rejects an artifact missing %s',
    (field) => {
      expect(() =>
        parseDump(
          dumpText({ units: [unit({ artifacts: [omit(artifact(), field)] })] }),
        ),
      ).toThrow(new RegExp(field));
    },
  );

  it('rejects a source outside the union', () => {
    expect(() => parseDump(withArtifact({ source: 'robot' }))).toThrow(/source/);
  });

  it('accepts an absent messageIndex', () => {
    expect(() => parseDump(withArtifact({}))).not.toThrow();
  });

  it('rejects a non-numeric messageIndex when present', () => {
    expect(() => parseDump(withArtifact({ messageIndex: 'first' }))).toThrow(
      /messageIndex/,
    );
  });
});

describe('[G1] parseDump — error paths', () => {
  it('names the path of an offending artifact field', () => {
    const units = [
      unit({ id: 'u0' }),
      unit({ id: 'u1' }),
      unit({ id: 'u2' }),
      unit({ id: 'u3', artifacts: [omit(artifact(), 'savedAt')] }),
    ];
    expect(() => parseDump(dumpText({ units }))).toThrow(
      /units\[3\]\.artifacts\[0\]\.savedAt/,
    );
  });

  it('names the path of an offending message field', () => {
    expect(() =>
      parseDump(
        dumpText({ units: [unit({ messages: [omit(message(), 'content')] })] }),
      ),
    ).toThrow(/units\[0\]\.messages\[0\]\.content/);
  });

  it('names the path of an offending configuration field', () => {
    expect(() =>
      parseDump(dumpText({ configurations: [cfg(), omit(cfg(), 'archived')] })),
    ).toThrow(/configurations\[1\]\.archived/);
  });
});

describe('[G1] parseDump — boundary discipline', () => {
  it('does not judge schemaVersion equality — that is assertValidDump', () => {
    const parsed = parseDump(dumpText({ schemaVersion: SCHEMA_VERSION + 99 }));
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION + 99);
  });

  it('does not judge referential integrity — that is assertValidDump', () => {
    const parsed = parseDump(
      dumpText({ units: [unit({ configName: 'absent-lineage' })] }),
    );
    expect(parsed.units).toHaveLength(1);
  });

  it('strips unknown keys from a record rather than rejecting them', () => {
    const parsed = parseDump(
      dumpText({ configurations: [cfg({ bogus: 'x', archivedAt: T })] }),
    );
    expect(parsed.configurations).toEqual([
      { name: 'linkml', artifactType: 'yaml', archived: false },
    ]);
  });

  it('strips unknown keys from the envelope', () => {
    const parsed = parseDump(dumpText({ exportedAt: T }));
    const envelopeKeys = [
      'configurations',
      'configurationVersions',
      'schemaVersion',
      'units',
    ];
    expect(Object.keys(parsed).sort()).toEqual(envelopeKeys.sort());
  });

  it('strips unknown keys from nested messages and artifacts', () => {
    const parsed = parseDump(
      dumpText({
        units: [
          unit({
            messages: [message({ tokens: 12 })],
            artifacts: [artifact({ hash: 'abc' })],
          }),
        ],
      }),
    );
    expect(parsed.units).toEqual([
      {
        id: 'u1',
        conversationName: 'c',
        configName: 'linkml',
        createdAt: T,
        archived: false,
        messages: [{ role: 'user', configVersion: 1, sentAt: T, content: 'hello' }],
        artifacts: [
          { version: 1, savedAt: T, source: 'manual', content: 'x: 1' },
        ],
      },
    ]);
  });
});

describe('[G2] parseDump — edit-notice fields', () => {
  const noticeMessage = (over: Json = {}): Json =>
    message({
      kind: 'editNotice',
      artifactVersion: 1,
      content: 'notice body',
      ...over,
    });

  it('round-trips kind and artifactVersion through serialize and parse', () => {
    const text = dumpText({ units: [unit({ messages: [noticeMessage()] })] });
    const parsed = parseDump(text);
    expect(parsed.units[0]?.messages[0]).toMatchObject({
      kind: 'editNotice',
      artifactVersion: 1,
    });
    expect(parseDump(serializeDump(parsed))).toEqual(parsed);
  });

  it('rejects an unknown kind, naming the path', () => {
    const text = dumpText({
      units: [unit({ messages: [noticeMessage({ kind: 'weird' })] })],
    });
    expect(() => parseDump(text)).toThrow(/units\[0\]\.messages\[0\]\.kind/);
  });

  it('rejects artifactVersion without kind', () => {
    const stray = message({ artifactVersion: 1 });
    const text = dumpText({ units: [unit({ messages: [stray] })] });
    expect(() => parseDump(text)).toThrow(/artifactVersion/);
  });

  it('rejects kind without artifactVersion', () => {
    const bare = message({ kind: 'editNotice' });
    const text = dumpText({ units: [unit({ messages: [bare] })] });
    expect(() => parseDump(text)).toThrow(/artifactVersion/);
  });
});
