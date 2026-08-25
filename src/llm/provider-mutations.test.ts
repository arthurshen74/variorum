/**
 * [G2] Pure mutations of the Models/Providers document (DESIGN.md
 * "Models and Providers"): every uniqueness rule, the deletion refusal,
 * reassignment, and purity over the input.
 */
import { describe, expect, it } from 'vitest';
import type { Endpoint, ProviderDocument } from './provider-document';
import {
  ENDPOINT_EXISTS_MESSAGE,
  ENDPOINT_HAS_MODELS_MESSAGE,
  HANDLE_EXISTS_MESSAGE,
  MODEL_EXISTS_ON_ENDPOINT_MESSAGE,
  addEndpoint,
  addModel,
  deleteEndpoint,
  deleteModel,
  reassignModel,
  updateEndpoint,
  updateModel,
  type MutationResult,
} from './provider-mutations';

function endpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    id: 'ep-1',
    url: 'http://host:1/v1',
    api: 'openai-compatible',
    authRequired: false,
    models: [],
    ...overrides,
  };
}

function base(): ProviderDocument {
  return {
    endpoints: [
      endpoint({
        id: 'ep-1',
        authRequired: true,
        apiKey: 'endpoint-key',
        models: [
          { modelName: 'qwen/qwen3-14b', handle: 'qwen-local' },
          {
            modelName: 'meta/llama',
            handle: 'llama',
            apiKey: 'model-key',
            maxOutputTokens: 2048,
          },
        ],
      }),
      endpoint({
        id: 'ep-2',
        url: 'http://host:2/v1',
        api: 'anthropic-messages',
        models: [{ modelName: 'claude-x', handle: 'claude' }],
      }),
    ],
  };
}

function ok(result: MutationResult): ProviderDocument {
  if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
  return result.document;
}

function refused(result: MutationResult, message: string): void {
  expect(result).toEqual({ ok: false, message });
}

const find = (document: ProviderDocument, id: string) =>
  document.endpoints.find((e) => e.id === id);

describe('[G2] endpoint mutations', () => {
  it('addEndpoint appends with the given id; refuses a duplicate (url, api); allows the same url under another protocol', () => {
    const added = ok(
      addEndpoint(
        base(),
        {
          url: 'http://host:3/v1',
          api: 'openai-compatible',
          authRequired: true,
          apiKey: 'k',
        },
        'ep-3',
      ),
    );
    expect(added.endpoints).toHaveLength(3);
    expect(added.endpoints[2]).toEqual({
      id: 'ep-3',
      url: 'http://host:3/v1',
      api: 'openai-compatible',
      authRequired: true,
      apiKey: 'k',
      models: [],
    });

    refused(
      addEndpoint(
        base(),
        {
          url: 'http://host:1/v1',
          api: 'openai-compatible',
          authRequired: false,
        },
        'ep-x',
      ),
      ENDPOINT_EXISTS_MESSAGE,
    );

    const sameUrl = ok(
      addEndpoint(
        base(),
        {
          url: 'http://host:1/v1',
          api: 'anthropic-messages',
          authRequired: false,
        },
        'ep-4',
      ),
    );
    expect(find(sameUrl, 'ep-4')?.api).toBe('anthropic-messages');
  });

  it('updateEndpoint changes fields in place keeping id and models; stores exactly the given input (an omitted key is removed)', () => {
    const updated = ok(
      updateEndpoint(base(), 'ep-1', {
        url: 'http://moved:9/v1',
        api: 'openai-compatible',
        authRequired: false,
      }),
    );
    const moved = find(updated, 'ep-1');
    expect(moved).toEqual({
      id: 'ep-1',
      url: 'http://moved:9/v1',
      api: 'openai-compatible',
      authRequired: false,
      models: base().endpoints[0]?.models,
    });
    expect(moved).not.toHaveProperty('apiKey');
    expect(updated.endpoints.map((e) => e.id)).toEqual(['ep-1', 'ep-2']);
  });

  it('updateEndpoint refuses a (url, api) held by another endpoint; keeping its own pair is allowed', () => {
    refused(
      updateEndpoint(base(), 'ep-1', {
        url: 'http://host:2/v1',
        api: 'anthropic-messages',
        authRequired: false,
      }),
      ENDPOINT_EXISTS_MESSAGE,
    );

    const same = ok(
      updateEndpoint(base(), 'ep-1', {
        url: 'http://host:1/v1',
        api: 'openai-compatible',
        authRequired: false,
      }),
    );
    expect(find(same, 'ep-1')?.authRequired).toBe(false);
  });

  it('deleteEndpoint removes an empty endpoint; refuses while models remain', () => {
    refused(deleteEndpoint(base(), 'ep-2'), ENDPOINT_HAS_MODELS_MESSAGE);

    const emptied = deleteModel(base(), 'claude');
    const deleted = ok(deleteEndpoint(emptied, 'ep-2'));
    expect(deleted.endpoints.map((e) => e.id)).toEqual(['ep-1']);
  });
});

describe('[G2] model mutations', () => {
  it('addModel appends under the endpoint; refuses a handle held anywhere; refuses a modelName already on that endpoint; allows it on another', () => {
    const added = ok(
      addModel(base(), 'ep-2', {
        modelName: 'claude-y',
        handle: 'claude-y',
        maxOutputTokens: 100,
      }),
    );
    expect(find(added, 'ep-2')?.models).toEqual([
      { modelName: 'claude-x', handle: 'claude' },
      { modelName: 'claude-y', handle: 'claude-y', maxOutputTokens: 100 },
    ]);
    expect(find(added, 'ep-1')?.models).toHaveLength(2);

    refused(
      addModel(base(), 'ep-2', { modelName: 'new', handle: 'llama' }),
      HANDLE_EXISTS_MESSAGE,
    );
    refused(
      addModel(base(), 'ep-1', {
        modelName: 'qwen/qwen3-14b',
        handle: 'qwen-again',
      }),
      MODEL_EXISTS_ON_ENDPOINT_MESSAGE,
    );

    const across = ok(
      addModel(base(), 'ep-2', {
        modelName: 'qwen/qwen3-14b',
        handle: 'qwen-remote',
      }),
    );
    expect(find(across, 'ep-2')?.models).toHaveLength(2);
  });

  it("updateModel replaces the row; keeping its own handle is allowed; refuses another row's handle or a sibling's modelName", () => {
    const kept = ok(
      updateModel(base(), 'llama', {
        modelName: 'meta/llama-3',
        handle: 'llama',
        apiKey: 'k2',
      }),
    );
    expect(find(kept, 'ep-1')?.models[1]).toEqual({
      modelName: 'meta/llama-3',
      handle: 'llama',
      apiKey: 'k2',
    });

    const renamed = ok(
      updateModel(base(), 'llama', {
        modelName: 'meta/llama',
        handle: 'llama-70b',
      }),
    );
    expect(find(renamed, 'ep-1')?.models.map((m) => m.handle)).toEqual([
      'qwen-local',
      'llama-70b',
    ]);

    refused(
      updateModel(base(), 'llama', {
        modelName: 'meta/llama',
        handle: 'claude',
      }),
      HANDLE_EXISTS_MESSAGE,
    );
    refused(
      updateModel(base(), 'llama', {
        modelName: 'qwen/qwen3-14b',
        handle: 'llama',
      }),
      MODEL_EXISTS_ON_ENDPOINT_MESSAGE,
    );
  });

  it('deleteModel removes the row', () => {
    const deleted = deleteModel(base(), 'qwen-local');
    expect(find(deleted, 'ep-1')?.models).toEqual([
      {
        modelName: 'meta/llama',
        handle: 'llama',
        apiKey: 'model-key',
        maxOutputTokens: 2048,
      },
    ]);
    expect(find(deleted, 'ep-2')?.models).toHaveLength(1);
  });

  it('reassignModel moves the row intact (handle, key, cap); refuses when the target serves that modelName; own endpoint is a no-op', () => {
    const moved = ok(reassignModel(base(), 'llama', 'ep-2'));
    expect(find(moved, 'ep-1')?.models).toEqual([
      { modelName: 'qwen/qwen3-14b', handle: 'qwen-local' },
    ]);
    expect(find(moved, 'ep-2')?.models).toEqual([
      { modelName: 'claude-x', handle: 'claude' },
      {
        modelName: 'meta/llama',
        handle: 'llama',
        apiKey: 'model-key',
        maxOutputTokens: 2048,
      },
    ]);

    const conflicting = ok(
      addModel(base(), 'ep-2', {
        modelName: 'qwen/qwen3-14b',
        handle: 'qwen-remote',
      }),
    );
    refused(
      reassignModel(conflicting, 'qwen-local', 'ep-2'),
      MODEL_EXISTS_ON_ENDPOINT_MESSAGE,
    );

    const same = ok(reassignModel(base(), 'llama', 'ep-1'));
    expect(same).toEqual(base());
  });
});

describe('[G2] mutation invariants', () => {
  it('mutations never mutate the input document', () => {
    const input = base();
    const snapshot = JSON.stringify(input);
    addEndpoint(
      input,
      {
        url: 'http://host:3/v1',
        api: 'openai-compatible',
        authRequired: false,
      },
      'ep-3',
    );
    updateEndpoint(input, 'ep-1', {
      url: 'http://moved/v1',
      api: 'openai-compatible',
      authRequired: false,
    });
    deleteEndpoint(input, 'ep-2');
    addModel(input, 'ep-2', { modelName: 'n', handle: 'n' });
    updateModel(input, 'llama', { modelName: 'x', handle: 'llama' });
    deleteModel(input, 'llama');
    reassignModel(input, 'claude', 'ep-1');
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('an unknown endpoint id or handle throws', () => {
    expect(() =>
      updateEndpoint(base(), 'ghost', {
        url: 'http://h/v1',
        api: 'openai-compatible',
        authRequired: false,
      }),
    ).toThrow(/ghost/);
    expect(() => deleteEndpoint(base(), 'ghost')).toThrow(/ghost/);
    expect(() =>
      addModel(base(), 'ghost', { modelName: 'm', handle: 'm' }),
    ).toThrow(/ghost/);
    expect(() =>
      updateModel(base(), 'ghost', { modelName: 'm', handle: 'ghost' }),
    ).toThrow(/ghost/);
    expect(() => deleteModel(base(), 'ghost')).toThrow(/ghost/);
    expect(() => reassignModel(base(), 'ghost', 'ep-1')).toThrow(/ghost/);
    expect(() => reassignModel(base(), 'llama', 'ghost')).toThrow(/ghost/);
  });
});
