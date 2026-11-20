/**
 * [G3] Choosing a model at use (DESIGN.md "First-Run Setup", "Choosing a
 * model at use"): what the control offers for a configuration, the draft
 * its Save mints — the latest recipe with only the handle replaced — and
 * the New Unit ordering, version first and then unit. Ports in: no
 * browser, no IndexedDB.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ConfigurationVersion, Unit } from '@/domain/types';
import type { ProviderDocument } from '@/llm/provider-document';
import {
  createUnitWithModel,
  modelChoiceFor,
  type ModelChoicePorts,
  rebindDraft,
} from './model-choice';

const DOCUMENT: ProviderDocument = {
  endpoints: [
    {
      id: 'ep-1',
      url: 'http://host:1/v1',
      api: 'openai-compatible',
      authRequired: false,
      models: [
        { modelName: 'wire-alpha', handle: 'alpha' },
        { modelName: 'wire-beta', handle: 'beta' },
      ],
    },
    {
      id: 'ep-2',
      url: 'http://host:2/v1',
      api: 'openai-compatible',
      authRequired: false,
      models: [{ modelName: 'wire-gamma', handle: 'gamma' }],
    },
  ],
};

const FULL_VERSION: ConfigurationVersion = {
  name: 'notes',
  version: 3,
  modelName: 'ghost',
  systemPrompt: 'You produce notes.',
  temperature: 0.2,
  topP: 0.9,
  topK: 40,
  reasoningEffort: 'low',
};

const MINIMAL_VERSION: ConfigurationVersion = {
  name: 'notes',
  version: 1,
  modelName: 'ghost',
  systemPrompt: 'You produce notes.',
};

const UNIT: Unit = {
  id: 'u-1',
  conversationName: 'thread',
  configName: 'notes',
  createdAt: '2026-01-01T00:00:00.000Z',
  archived: false,
  messages: [],
  artifacts: [],
};

describe('[G3] modelChoiceFor', () => {
  it('offers nothing when the handle is bound', () => {
    expect(
      modelChoiceFor({ ...FULL_VERSION, modelName: 'beta' }, DOCUMENT),
    ).toBeNull();
  });

  it('offers the next designator and the document handles in order when the handle is unbound', () => {
    expect(modelChoiceFor(FULL_VERSION, DOCUMENT)).toEqual({
      designator: 'notes.4',
      handles: ['alpha', 'beta', 'gamma'],
    });
  });

  it('offers no handles when the document holds no model', () => {
    expect(modelChoiceFor(FULL_VERSION, { endpoints: [] })).toEqual({
      designator: 'notes.4',
      handles: [],
    });
  });

  it('offers no handles for a malformed document, never null', () => {
    expect(modelChoiceFor(FULL_VERSION, null)).toEqual({
      designator: 'notes.4',
      handles: [],
    });
  });
});

describe('[G3] rebindDraft', () => {
  it('replaces only the model handle and carries every other recipe field', () => {
    expect(rebindDraft(FULL_VERSION, 'alpha')).toStrictEqual({
      modelName: 'alpha',
      systemPrompt: 'You produce notes.',
      temperature: 0.2,
      topP: 0.9,
      topK: 40,
      reasoningEffort: 'low',
    });
  });

  it('leaves absent optional fields absent and carries no name or version', () => {
    expect(rebindDraft(MINIMAL_VERSION, 'alpha')).toStrictEqual({
      modelName: 'alpha',
      systemPrompt: 'You produce notes.',
    });
  });
});

describe('[G3] createUnitWithModel', () => {
  function makePorts(calls: string[]): ModelChoicePorts {
    return {
      saveConfigurationVersion: vi.fn(async (name, draft) => {
        calls.push('save');
        return { name, version: 4, ...draft };
      }),
      createUnit: vi.fn(async () => {
        calls.push('create');
        return UNIT;
      }),
    };
  }

  it('with a handle saves the rebound draft, then creates the unit', async () => {
    const calls: string[] = [];
    const ports = makePorts(calls);
    const unit = await createUnitWithModel(
      ports,
      'thread',
      FULL_VERSION,
      'alpha',
    );
    expect(unit).toEqual(UNIT);
    expect(calls).toEqual(['save', 'create']);
    expect(ports.saveConfigurationVersion).toHaveBeenCalledWith('notes', {
      modelName: 'alpha',
      systemPrompt: 'You produce notes.',
      temperature: 0.2,
      topP: 0.9,
      topK: 40,
      reasoningEffort: 'low',
    });
    expect(ports.createUnit).toHaveBeenCalledWith('thread', 'notes');
  });

  it('with no handle only creates the unit', async () => {
    const calls: string[] = [];
    const ports = makePorts(calls);
    const unit = await createUnitWithModel(ports, 'thread', FULL_VERSION, null);
    expect(unit).toEqual(UNIT);
    expect(calls).toEqual(['create']);
    expect(ports.saveConfigurationVersion).not.toHaveBeenCalled();
  });

  it('a failed save creates no unit and rejects', async () => {
    const calls: string[] = [];
    const ports: ModelChoicePorts = {
      ...makePorts(calls),
      saveConfigurationVersion: vi.fn(async () => {
        throw new Error('save failed');
      }),
    };
    await expect(
      createUnitWithModel(ports, 'thread', FULL_VERSION, 'alpha'),
    ).rejects.toThrow('save failed');
    expect(ports.createUnit).not.toHaveBeenCalled();
  });
});
