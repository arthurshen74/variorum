/**
 * [G2] completeExchange under the Chat design (DESIGN.md "Chat"):
 * reasoning persistence, the unchanged-artifact rule (equal bytes mint
 * nothing, mirroring saveManualEdit), revision stitching via
 * messageIndex, and latest-saved-version tagging across a config save.
 */
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { repository } from './repository';
import { variorumStore } from '@/state/store';
import type { AssistantCompletion, Unit } from '@/domain/types';

const DRAFT = { modelName: 'm', systemPrompt: 's' };

async function newUnit(configName: string): Promise<Unit> {
  await repository.createConfiguration(
    { name: configName, artifactType: 'yaml' },
    DRAFT,
  );
  return repository.createUnit('thread', configName);
}

function completion(content: string, reasoning?: string): AssistantCompletion {
  return {
    content,
    sentAt: '2026-08-03T10:00:00.000Z',
    receivedFinishedAt: '2026-08-03T10:00:05.000Z',
    ...(reasoning !== undefined ? { reasoning } : {}),
  };
}

describe('[G2] completeExchange — reasoning and the unchanged-artifact rule', () => {
  beforeAll(async () => {
    await repository.boot();
  });

  it('persists reasoning on the assistant message, durably', async () => {
    const unit = await newUnit('cfg-reasoning');
    await repository.appendUserMessage(unit.id, 'hi');
    const updated = await repository.completeExchange(
      unit.id,
      completion('ok', 'first this, then that'),
    );
    expect(updated.messages[1]?.reasoning).toBe('first this, then that');

    // Durable, not just in-memory: re-hydrating from IndexedDB keeps it.
    await repository.boot();
    const rebooted = variorumStore
      .getState()
      .units.find((u) => u.id === unit.id);
    expect(rebooted?.messages[1]?.reasoning).toBe('first this, then that');
  });

  it('stores no reasoning field when the completion has none', async () => {
    const unit = await newUnit('cfg-no-reasoning');
    await repository.appendUserMessage(unit.id, 'hi');
    const updated = await repository.completeExchange(unit.id, completion('ok'));
    const message = updated.messages[1];
    expect(message).toBeDefined();
    expect(message !== undefined && 'reasoning' in message).toBe(false);
  });

  it('artifactContent equal to the latest revision appends the message but mints nothing', async () => {
    const unit = await newUnit('cfg-unchanged');
    await repository.appendUserMessage(unit.id, 'make it');
    await repository.completeExchange(unit.id, completion('v1'), 'a: 1\n');
    await repository.appendUserMessage(unit.id, 'again');
    const updated = await repository.completeExchange(
      unit.id,
      completion('same again'),
      'a: 1\n',
    );
    expect(updated.messages).toHaveLength(4);
    expect(updated.artifacts).toHaveLength(1);
  });

  it('changed artifactContent mints an llm revision stitched to the new message', async () => {
    const unit = await newUnit('cfg-changed');
    await repository.appendUserMessage(unit.id, 'make it');
    await repository.completeExchange(unit.id, completion('v1'), 'a: 1\n');
    await repository.appendUserMessage(unit.id, 'improve it');
    const updated = await repository.completeExchange(
      unit.id,
      completion('v2'),
      'b: 2\n',
    );
    expect(updated.artifacts).toHaveLength(2);
    expect(updated.artifacts.at(-1)).toMatchObject({
      version: 2,
      source: 'llm',
      messageIndex: 3,
      content: 'b: 2\n',
    });
  });

  it('the first response with a fence mints revision 1', async () => {
    const unit = await newUnit('cfg-first');
    await repository.appendUserMessage(unit.id, 'make it');
    const updated = await repository.completeExchange(
      unit.id,
      completion('here'),
      'a: 1\n',
    );
    expect(updated.artifacts).toEqual([
      expect.objectContaining({
        version: 1,
        source: 'llm',
        messageIndex: 1,
        content: 'a: 1\n',
      }),
    ]);
  });

  it('compares against the latest revision regardless of source', async () => {
    const unit = await newUnit('cfg-manual-latest');
    await repository.saveManualEdit(unit.id, 'x: 9\n');
    await repository.appendUserMessage(unit.id, 'reproduce it');
    const updated = await repository.completeExchange(
      unit.id,
      completion('same as your edit'),
      'x: 9\n',
    );
    expect(updated.artifacts).toHaveLength(1);
    expect(updated.artifacts[0]?.source).toBe('manual');
  });

  it('exchanges straddling a config save are tagged with the two versions', async () => {
    const unit = await newUnit('cfg-straddle');
    await repository.appendUserMessage(unit.id, 'one');
    await repository.completeExchange(unit.id, completion('r1'));
    await repository.saveConfigurationVersion('cfg-straddle', {
      modelName: 'm2',
      systemPrompt: 's2',
    });
    await repository.appendUserMessage(unit.id, 'two');
    const updated = await repository.completeExchange(unit.id, completion('r2'));
    expect(updated.messages.map((m) => m.configVersion)).toEqual([1, 1, 2, 2]);
  });
});
