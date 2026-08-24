/**
 * [G3] Models-view helpers (DESIGN.md "Management UI"): the listed model
 * set comes from the LATEST saved version of every configuration, and
 * the draft boundary turns field text into a saveable binding or blocks
 * the save. Filter by file — older manifests reuse the [G3] tag.
 */
import { describe, expect, it } from 'vitest';
import {
  boundModelNames,
  draftFromBinding,
  parseBindingDraft,
  type ModelBindingDraft,
} from './model-binding-form';
import { DEFAULT_BASE_URL, DEFAULT_BINDING } from '@/llm/model-binding';
import type { Configuration, ConfigurationVersion } from '@/domain/types';

function config(name: string, archived = false): Configuration {
  return { name, artifactType: 'yaml', archived };
}

function version(
  name: string,
  versionNumber: number,
  modelName: string,
): ConfigurationVersion {
  return { name, version: versionNumber, modelName, systemPrompt: 'p' };
}

describe('[G3] boundModelNames', () => {
  it('uses only the latest saved version of each configuration', () => {
    const names = boundModelNames(
      [config('linkml')],
      [version('linkml', 1, 'old-model'), version('linkml', 2, 'new-model')],
    );
    expect(names).toEqual(['new-model']);
  });

  it('includes archived configurations', () => {
    const names = boundModelNames(
      [config('linkml'), config('retired', true)],
      [version('linkml', 1, 'qwen'), version('retired', 1, 'claude-mock')],
    );
    expect(names).toEqual(['claude-mock', 'qwen']);
  });

  it('dedupes across configurations and sorts', () => {
    const names = boundModelNames(
      [config('b-config'), config('a-config'), config('c-config')],
      [
        version('b-config', 1, 'zeta'),
        version('a-config', 1, 'alpha'),
        version('c-config', 1, 'zeta'),
      ],
    );
    expect(names).toEqual(['alpha', 'zeta']);
  });
});

describe('[G3] draftFromBinding', () => {
  it('prefills field text from a full binding', () => {
    expect(
      draftFromBinding({
        api: 'anthropic-messages',
        endpointUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-ant-test',
        maxOutputTokens: 8000,
      }),
    ).toEqual({
      api: 'anthropic-messages',
      endpointUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      maxOutputTokens: '8000',
    });
  });

  it('leaves key and max output tokens blank when unset', () => {
    expect(draftFromBinding(DEFAULT_BINDING)).toEqual({
      api: 'openai-compatible',
      endpointUrl: DEFAULT_BASE_URL,
      apiKey: '',
      maxOutputTokens: '',
    });
  });
});

describe('[G3] parseBindingDraft', () => {
  const anthropicDraft: ModelBindingDraft = {
    api: 'anthropic-messages',
    endpointUrl: '  https://api.anthropic.com/v1  ',
    apiKey: '  sk-ant-test  ',
    maxOutputTokens: '8000',
  };

  it('builds a binding from a valid draft, trimming URL and key', () => {
    expect(parseBindingDraft(anthropicDraft)).toEqual({
      api: 'anthropic-messages',
      endpointUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      maxOutputTokens: 8000,
    });
  });

  it('returns null for an unparseable endpoint URL', () => {
    expect(
      parseBindingDraft({ ...anthropicDraft, endpointUrl: 'not a url' }),
    ).toBeNull();
    expect(
      parseBindingDraft({ ...anthropicDraft, endpointUrl: '' }),
    ).toBeNull();
  });

  it('omits the key when the field is empty or whitespace', () => {
    const binding = parseBindingDraft({ ...anthropicDraft, apiKey: '   ' });
    expect(binding).not.toBeNull();
    expect(binding !== null && 'apiKey' in binding).toBe(false);
  });

  it('omits maxOutputTokens when blank; blocks the save when non-numeric', () => {
    const blank = parseBindingDraft({ ...anthropicDraft, maxOutputTokens: '' });
    expect(blank).not.toBeNull();
    expect(blank !== null && 'maxOutputTokens' in blank).toBe(false);

    expect(
      parseBindingDraft({ ...anthropicDraft, maxOutputTokens: 'abc' }),
    ).toBeNull();
  });

  it('never carries maxOutputTokens on an openai-compatible draft', () => {
    const binding = parseBindingDraft({
      api: 'openai-compatible',
      endpointUrl: 'http://localhost:1234/v1',
      apiKey: '',
      maxOutputTokens: '9000',
    });
    expect(binding).toEqual({
      api: 'openai-compatible',
      endpointUrl: 'http://localhost:1234/v1',
    });
  });
});
