/**
 * [G1] appendPendingEditNotice under DESIGN.md "Refresh — the stranded
 * user message": the notice a Refresh mints is appended AFTER the
 * already-persisted user message, no-ops when nothing is pending, and
 * leaves the message prefix and the artifact history untouched.
 */
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { repository } from './repository';
import { editNoticeContent } from '@/domain/edit-notice';
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

function completion(content: string): AssistantCompletion {
  return {
    content,
    sentAt: '2026-08-19T10:00:00.000Z',
    receivedFinishedAt: '2026-08-19T10:00:05.000Z',
  };
}

/** The stranded state: one user message sent, no response recorded. */
async function stranded(configName: string): Promise<Unit> {
  const unit = await newUnit(configName);
  return repository.appendUserMessage(unit.id, 'make it');
}

describe('[G1] appendPendingEditNotice — the Refresh notice', () => {
  beforeAll(async () => {
    await repository.boot();
  });

  it('appends the notice after the trailing user message', async () => {
    const unit = await stranded('cfg-rf-append');
    await repository.saveManualEdit(unit.id, 'x: 1\n');
    const updated = await repository.appendPendingEditNotice(unit.id);

    expect(updated.messages).toHaveLength(2);
    expect(updated.messages[0]).toMatchObject({ content: 'make it' });
    const first = updated.messages[0];
    expect(first !== undefined && 'kind' in first).toBe(false);
    expect(updated.messages[1]).toMatchObject({
      role: 'user',
      kind: 'editNotice',
    });
  });

  it('the notice carries the revision designator and its bytes', async () => {
    const unit = await stranded('cfg-rf-content');
    await repository.saveManualEdit(unit.id, 'x: 9\n');
    const updated = await repository.appendPendingEditNotice(unit.id);

    expect(updated.messages[1]?.artifactVersion).toBe(1);
    expect(updated.messages[1]?.content).toBe(
      editNoticeContent('yaml', 'x: 9\n'),
    );
  });

  it('the notice is tagged with the latest saved configuration version', async () => {
    const unit = await stranded('cfg-rf-version');
    await repository.saveManualEdit(unit.id, 'x: 1\n');
    await repository.saveConfigurationVersion('cfg-rf-version', {
      modelName: 'm2',
      systemPrompt: 's2',
    });
    const updated = await repository.appendPendingEditNotice(unit.id);

    expect(updated.messages.map((m) => m.configVersion)).toEqual([1, 2]);
  });

  it('no-ops when the latest revision came from the model', async () => {
    const unit = await stranded('cfg-rf-llm');
    await repository.completeExchange(unit.id, completion('here'), 'a: 1\n');
    await repository.appendUserMessage(unit.id, 'again');
    const updated = await repository.appendPendingEditNotice(unit.id);

    expect(updated.messages).toHaveLength(3);
    expect(updated.messages.some((m) => m.kind === 'editNotice')).toBe(false);
  });

  it('no-ops when the latest manual revision is already announced', async () => {
    const unit = await newUnit('cfg-rf-announced');
    await repository.saveManualEdit(unit.id, 'x: 1\n');
    await repository.appendUserMessage(unit.id, 'go');
    const updated = await repository.appendPendingEditNotice(unit.id);

    expect(updated.messages).toHaveLength(2);
    expect(
      updated.messages.filter((m) => m.kind === 'editNotice'),
    ).toHaveLength(1);
  });

  it('no-ops when the unit has no artifacts at all', async () => {
    const unit = await stranded('cfg-rf-empty');
    const updated = await repository.appendPendingEditNotice(unit.id);

    expect(updated.messages).toHaveLength(1);
  });

  it('a second call with no intervening save appends nothing', async () => {
    const unit = await stranded('cfg-rf-idempotent');
    await repository.saveManualEdit(unit.id, 'x: 1\n');
    await repository.appendPendingEditNotice(unit.id);
    const updated = await repository.appendPendingEditNotice(unit.id);

    expect(updated.messages).toHaveLength(2);
    expect(
      updated.messages.filter((m) => m.kind === 'editNotice'),
    ).toHaveLength(1);
  });

  it('a further manual save arms a second notice', async () => {
    const unit = await stranded('cfg-rf-second');
    await repository.saveManualEdit(unit.id, 'x: 1\n');
    await repository.appendPendingEditNotice(unit.id);
    await repository.saveManualEdit(unit.id, 'y: 2\n');
    const updated = await repository.appendPendingEditNotice(unit.id);

    expect(
      updated.messages
        .filter((m) => m.kind === 'editNotice')
        .map((m) => m.artifactVersion),
    ).toEqual([1, 2]);
  });

  it('never reorders or mutates the existing messages', async () => {
    const unit = await newUnit('cfg-rf-prefix');
    await repository.appendUserMessage(unit.id, 'one');
    await repository.completeExchange(unit.id, completion('r1'), 'a: 1\n');
    const before = await repository.appendUserMessage(unit.id, 'two');
    const prefix = structuredClone(before.messages);

    await repository.saveManualEdit(unit.id, 'edited: true\n');
    const updated = await repository.appendPendingEditNotice(unit.id);

    expect(updated.messages.slice(0, prefix.length)).toEqual(prefix);
    expect(updated.messages).toHaveLength(prefix.length + 1);
  });

  it('never touches the artifact history', async () => {
    const unit = await stranded('cfg-rf-artifacts');
    await repository.saveManualEdit(unit.id, 'x: 1\n');
    const before = structuredClone(
      (
        variorumStore.getState().units.find((u) => u.id === unit.id) as Unit
      ).artifacts,
    );
    const updated = await repository.appendPendingEditNotice(unit.id);

    expect(updated.artifacts).toEqual(before);
  });

  it('the appended notice is durable across a reboot', async () => {
    const unit = await stranded('cfg-rf-durable');
    await repository.saveManualEdit(unit.id, 'x: 1\n');
    await repository.appendPendingEditNotice(unit.id);

    await repository.boot();
    const rebooted = variorumStore
      .getState()
      .units.find((u) => u.id === unit.id);
    expect(rebooted?.messages.at(-1)).toMatchObject({
      kind: 'editNotice',
      artifactVersion: 1,
    });
  });

  it('a later appendUserMessage does not announce the same revision twice', async () => {
    const unit = await stranded('cfg-rf-seam');
    await repository.saveManualEdit(unit.id, 'x: 1\n');
    await repository.appendPendingEditNotice(unit.id);
    const updated = await repository.appendUserMessage(
      unit.id,
      'never mind, do this',
    );

    expect(
      updated.messages.filter((m) => m.kind === 'editNotice'),
    ).toHaveLength(1);
    expect(updated.messages.at(-1)).toMatchObject({
      content: 'never mind, do this',
    });
  });
});
