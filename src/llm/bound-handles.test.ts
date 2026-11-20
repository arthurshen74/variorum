/**
 * [G3] boundHandles (DESIGN.md "First-Run Setup", "Choosing a model at
 * use"): the handles a Models/Providers document binds — what the
 * model-choice control offers.
 */
import { describe, expect, it } from 'vitest';
import type { ProviderDocument } from './provider-document';
import { boundHandles } from './resolve-model';

const DOCUMENT: ProviderDocument = {
  endpoints: [
    {
      id: 'ep-1',
      url: 'http://host:1/v1',
      api: 'openai-compatible',
      authRequired: false,
      models: [
        { modelName: 'qwen/qwen3-14b', handle: 'qwen-local' },
        { modelName: 'meta/llama', handle: 'llama' },
      ],
    },
    {
      id: 'ep-2',
      url: 'http://host:2/v1',
      api: 'openai-compatible',
      authRequired: false,
      models: [],
    },
    {
      id: 'ep-3',
      url: 'http://host:3/v1',
      api: 'anthropic-messages',
      authRequired: true,
      models: [{ modelName: 'claude-x', handle: 'claude' }],
    },
  ],
};

describe('[G3] boundHandles', () => {
  it('lists every handle in document order across endpoints; an empty document binds none', () => {
    expect(boundHandles(DOCUMENT)).toEqual(['qwen-local', 'llama', 'claude']);
    expect(boundHandles({ endpoints: [] })).toEqual([]);
  });
});
