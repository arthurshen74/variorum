/**
 * [G1] Reasoning joins the byte-equality import-merge compares
 * (DESIGN.md "Chat", "Import Is a Merge"): two messages differing only
 * in reasoning are different records. These lock the property; merge.ts
 * compares whole records field-by-field, so no code change is expected —
 * the locks are what keep that true.
 */
import { describe, expect, it } from 'vitest';
import { planMerge } from './merge';
import type { DatabaseDump, Message, Unit } from './types';

const mintClone = () => 'clone-1';

function assistant(reasoning?: string): Message {
  return {
    role: 'assistant',
    configVersion: 1,
    sentAt: '2026-08-01T00:01:01.000Z',
    receivedFinishedAt: '2026-08-01T00:01:05.000Z',
    ...(reasoning !== undefined ? { reasoning } : {}),
    content: 'hello',
  };
}

const USER: Message = {
  role: 'user',
  configVersion: 1,
  sentAt: '2026-08-01T00:01:00.000Z',
  content: 'hi',
};

function unitWith(messages: Message[]): Unit {
  return {
    id: 'u-1',
    conversationName: 'thread',
    configName: 'linkml',
    createdAt: '2026-08-01T00:00:00.000Z',
    archived: false,
    messages,
    artifacts: [],
  };
}

function dumpWith(unit: Unit): DatabaseDump {
  return {
    schemaVersion: 1,
    configurations: [{ name: 'linkml', artifactType: 'yaml', archived: false }],
    configurationVersions: [
      { name: 'linkml', version: 1, modelName: 'm', systemPrompt: 's' },
    ],
    units: [unit],
  };
}

describe('[G1] import-merge byte-equality includes reasoning', () => {
  it('units identical except one message reasoning → diverged, keep both', () => {
    const local = dumpWith(unitWith([USER, assistant('local chain')]));
    const incoming = dumpWith(unitWith([USER, assistant('incoming chain')]));
    const plan = planMerge(local, incoming, mintClone);
    expect(plan.report.unitsKeptBoth).toEqual([
      { originalId: 'u-1', cloneId: 'clone-1' },
    ]);
  });

  it('units identical including reasoning → skip, nothing written', () => {
    const local = dumpWith(unitWith([USER, assistant('same chain')]));
    const incoming = dumpWith(unitWith([USER, assistant('same chain')]));
    const plan = planMerge(local, incoming, mintClone);
    expect(plan.units).toEqual([]);
    expect(plan.report.unitsAdded).toEqual([]);
    expect(plan.report.unitsFastForwarded).toEqual([]);
    expect(plan.report.unitsKeptBoth).toEqual([]);
  });

  it('fast-forward carries reasoning on the extension messages verbatim', () => {
    const local = dumpWith(unitWith([USER]));
    const incoming = dumpWith(unitWith([USER, assistant('carried chain')]));
    const plan = planMerge(local, incoming, mintClone);
    expect(plan.report.unitsFastForwarded).toEqual(['u-1']);
    expect(plan.units[0]?.messages[1]?.reasoning).toBe('carried chain');
  });
});
