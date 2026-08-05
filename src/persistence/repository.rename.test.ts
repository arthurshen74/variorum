/**
 * [G1] renameConversation under DESIGN.md "Management UI" (Rename):
 * first-time locks on the existing method — a conversationName is a
 * label, not an identity, so rename changes the label, nothing else,
 * durably, and counts as a mutation for prune's fresh-export gate.
 */
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { repository } from './repository';
import { variorumStore } from '@/state/store';
import type { Unit } from '@/domain/types';

const DRAFT = { modelName: 'm', systemPrompt: 's' };

async function newUnit(configName: string): Promise<Unit> {
  await repository.createConfiguration(
    { name: configName, artifactType: 'yaml' },
    DRAFT,
  );
  return repository.createUnit('before', configName);
}

describe('[G1] renameConversation — a label, not an identity', () => {
  beforeAll(async () => {
    await repository.boot();
  });

  it('renames and persists', async () => {
    const unit = await newUnit('cfg-rename');
    const renamed = await repository.renameConversation(unit.id, 'after');
    expect(renamed.conversationName).toBe('after');
    expect(
      variorumStore.getState().units.find((u) => u.id === unit.id)
        ?.conversationName,
    ).toBe('after');

    // Durable, not just in-memory: re-hydrating from IndexedDB keeps it.
    await repository.boot();
    expect(
      variorumStore.getState().units.find((u) => u.id === unit.id)
        ?.conversationName,
    ).toBe('after');
  });

  it('touches nothing but the name', async () => {
    const unit = await newUnit('cfg-rename-rest');
    await repository.appendUserMessage(unit.id, 'hello');
    const before = variorumStore
      .getState()
      .units.find((u) => u.id === unit.id);
    const renamed = await repository.renameConversation(unit.id, 'after');
    expect(before).toBeDefined();
    const { conversationName: _b, ...beforeRest } = before as Unit;
    const { conversationName: _a, ...afterRest } = renamed;
    expect(afterRest).toEqual(beforeRest);
  });

  it('rejects an unknown unit id', async () => {
    const unitsBefore = variorumStore.getState().units;
    await expect(
      repository.renameConversation('no-such-unit', 'after'),
    ).rejects.toThrow(/unknown unit/);
    expect(variorumStore.getState().units).toEqual(unitsBefore);
  });

  it('marks dirtySinceExport', async () => {
    const unit = await newUnit('cfg-rename-dirty');
    await repository.exportDatabase(async () => {});
    expect(variorumStore.getState().dirtySinceExport).toBe(false);
    await repository.renameConversation(unit.id, 'after');
    expect(variorumStore.getState().dirtySinceExport).toBe(true);
  });
});
