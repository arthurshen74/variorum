/**
 * [G4] Pure helpers behind the Models/Providers view (DESIGN.md
 * "Management UI", "Models and Providers"): the hint list, the tree's
 * label and key-gap flag, and the boundary between raw field text and
 * a mutation input for both forms.
 */
import { describe, expect, it } from 'vitest';
import type { Configuration, ConfigurationVersion } from '@/domain/types';
import type { Endpoint, ProviderDocument } from '@/llm/provider-document';
import {
  blankEndpointDraft,
  blankModelDraft,
  endpointDraftFrom,
  endpointLabel,
  hasKeyGap,
  modelDraftFrom,
  parseEndpointDraft,
  parseModelDraft,
  referencedUnboundHandles,
} from './provider-form';

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

const OPEN_NO_AUTH = endpoint();
const OPEN_AUTH = endpoint({
  id: 'ep-2',
  authRequired: true,
  apiKey: 'endpoint-key',
});
const ANTHROPIC_AUTH = endpoint({
  id: 'ep-3',
  api: 'anthropic-messages',
  authRequired: true,
  apiKey: 'ant-key',
});

function version(
  name: string,
  v: number,
  modelName: string,
): ConfigurationVersion {
  return { name, version: v, modelName, systemPrompt: 'S' };
}

describe('[G4] referencedUnboundHandles', () => {
  it('latest version only, archived included, deduped and sorted, minus handles the document binds', () => {
    const configurations: Configuration[] = [
      { name: 'a', artifactType: 'yaml', archived: false },
      { name: 'b', artifactType: 'yaml', archived: true },
      { name: 'c', artifactType: 'yaml', archived: false },
      { name: 'd', artifactType: 'yaml', archived: false },
    ];
    const versions = [
      version('a', 1, 'old-handle'),
      version('a', 2, 'zeta'),
      version('b', 1, 'archived-handle'),
      version('c', 1, 'zeta'),
      version('d', 1, 'bound'),
    ];
    const document: ProviderDocument = {
      endpoints: [
        endpoint({ models: [{ modelName: 'bound-wire', handle: 'bound' }] }),
      ],
    };
    expect(
      referencedUnboundHandles(configurations, versions, document),
    ).toEqual(['archived-handle', 'zeta']);
  });
});

describe('[G4] tree helpers', () => {
  it('endpointLabel renders <url> (<adapter label>)', () => {
    expect(endpointLabel(OPEN_NO_AUTH)).toBe(
      'http://host:1/v1 (OpenAI Chat Completions)',
    );
    expect(endpointLabel(ANTHROPIC_AUTH)).toBe(
      'http://host:1/v1 (Anthropic Messages)',
    );
  });

  it('hasKeyGap is true only for an auth-required endpoint with no key on either row', () => {
    const bare = { modelName: 'm', handle: 'm' };
    const keyed = { modelName: 'm', handle: 'm', apiKey: 'k' };
    const authNoKey = endpoint({ authRequired: true });
    expect(hasKeyGap(authNoKey, bare)).toBe(true);
    expect(hasKeyGap(authNoKey, keyed)).toBe(false);
    expect(hasKeyGap(OPEN_AUTH, bare)).toBe(false);
    expect(hasKeyGap(OPEN_NO_AUTH, bare)).toBe(false);
    expect(
      hasKeyGap(endpoint({ authRequired: false, apiKey: 'stale' }), bare),
    ).toBe(false);
  });
});

describe('[G4] drafts', () => {
  it('blankModelDraft(prefill) sets modelName and handle; draftFrom helpers blank an unset key and cap', () => {
    expect(blankModelDraft('ghost')).toEqual({
      modelName: 'ghost',
      handle: 'ghost',
      apiKey: '',
      maxOutputTokens: '',
    });
    expect(blankModelDraft()).toEqual({
      modelName: '',
      handle: '',
      apiKey: '',
      maxOutputTokens: '',
    });
    expect(modelDraftFrom({ modelName: 'm', handle: 'h' })).toEqual({
      modelName: 'm',
      handle: 'h',
      apiKey: '',
      maxOutputTokens: '',
    });
    expect(
      modelDraftFrom({
        modelName: 'm',
        handle: 'h',
        apiKey: 'k',
        maxOutputTokens: 8000,
      }),
    ).toEqual({
      modelName: 'm',
      handle: 'h',
      apiKey: 'k',
      maxOutputTokens: '8000',
    });
    expect(blankEndpointDraft()).toEqual({
      url: '',
      api: 'openai-compatible',
      authRequired: false,
      apiKey: '',
    });
    expect(endpointDraftFrom(OPEN_NO_AUTH)).toEqual({
      url: 'http://host:1/v1',
      api: 'openai-compatible',
      authRequired: false,
      apiKey: '',
    });
    expect(endpointDraftFrom(ANTHROPIC_AUTH)).toEqual({
      url: 'http://host:1/v1',
      api: 'anthropic-messages',
      authRequired: true,
      apiKey: 'ant-key',
    });
  });
});

describe('[G4] parseEndpointDraft', () => {
  it('trims the URL, refuses an unparseable one, omits the key when auth is not required or the field is blank', () => {
    expect(
      parseEndpointDraft({
        url: '  http://h:1/v1 ',
        api: 'anthropic-messages',
        authRequired: true,
        apiKey: ' k ',
      }),
    ).toEqual({
      ok: true,
      input: {
        url: 'http://h:1/v1',
        api: 'anthropic-messages',
        authRequired: true,
        apiKey: 'k',
      },
    });

    const bad = parseEndpointDraft({
      url: 'not a url',
      api: 'openai-compatible',
      authRequired: false,
      apiKey: '',
    });
    expect(bad.ok).toBe(false);
    expect(bad.ok ? '' : bad.message).toMatch(/URL/i);

    const noAuth = parseEndpointDraft({
      url: 'http://h:1/v1',
      api: 'openai-compatible',
      authRequired: false,
      apiKey: 'typed',
    });
    expect(noAuth).toEqual({
      ok: true,
      input: {
        url: 'http://h:1/v1',
        api: 'openai-compatible',
        authRequired: false,
      },
    });

    const blankKey = parseEndpointDraft({
      url: 'http://h:1/v1',
      api: 'openai-compatible',
      authRequired: true,
      apiKey: '   ',
    });
    expect(blankKey).toEqual({
      ok: true,
      input: {
        url: 'http://h:1/v1',
        api: 'openai-compatible',
        authRequired: true,
      },
    });
  });
});

describe('[G4] parseModelDraft', () => {
  it('trims, defaults a blank handle to the modelName, refuses an empty modelName', () => {
    expect(
      parseModelDraft(
        {
          modelName: ' qwen/x ',
          handle: '  ',
          apiKey: '',
          maxOutputTokens: '',
        },
        OPEN_NO_AUTH,
      ),
    ).toEqual({ ok: true, input: { modelName: 'qwen/x', handle: 'qwen/x' } });

    expect(
      parseModelDraft(
        {
          modelName: 'qwen/x',
          handle: ' local ',
          apiKey: '',
          maxOutputTokens: '',
        },
        OPEN_NO_AUTH,
      ),
    ).toEqual({ ok: true, input: { modelName: 'qwen/x', handle: 'local' } });

    const empty = parseModelDraft(
      { modelName: '  ', handle: 'h', apiKey: '', maxOutputTokens: '' },
      OPEN_NO_AUTH,
    );
    expect(empty.ok).toBe(false);
    expect(empty.ok ? '' : empty.message).toMatch(/model name/i);
  });

  it('parses the cap only when the adapter declares it, refuses non-numeric, omits blank; omits the key when the endpoint needs none', () => {
    expect(
      parseModelDraft(
        {
          modelName: 'c',
          handle: 'c',
          apiKey: ' k ',
          maxOutputTokens: ' 8000 ',
        },
        ANTHROPIC_AUTH,
      ),
    ).toEqual({
      ok: true,
      input: {
        modelName: 'c',
        handle: 'c',
        apiKey: 'k',
        maxOutputTokens: 8000,
      },
    });

    expect(
      parseModelDraft(
        { modelName: 'c', handle: 'c', apiKey: '', maxOutputTokens: '' },
        ANTHROPIC_AUTH,
      ),
    ).toEqual({ ok: true, input: { modelName: 'c', handle: 'c' } });

    const nonNumeric = parseModelDraft(
      { modelName: 'c', handle: 'c', apiKey: '', maxOutputTokens: 'lots' },
      ANTHROPIC_AUTH,
    );
    expect(nonNumeric.ok).toBe(false);
    expect(nonNumeric.ok ? '' : nonNumeric.message).toMatch(
      /max output tokens/i,
    );

    // Text stranded in the cap field never blocks a save under an adapter without a cap.
    expect(
      parseModelDraft(
        { modelName: 'q', handle: 'q', apiKey: 'k', maxOutputTokens: 'lots' },
        OPEN_AUTH,
      ),
    ).toEqual({
      ok: true,
      input: { modelName: 'q', handle: 'q', apiKey: 'k' },
    });

    expect(
      parseModelDraft(
        { modelName: 'q', handle: 'q', apiKey: 'typed', maxOutputTokens: '' },
        OPEN_NO_AUTH,
      ),
    ).toEqual({ ok: true, input: { modelName: 'q', handle: 'q' } });
  });
});
