/**
 * [G2] The setup gate's decisions (DESIGN.md "First-Run Setup", "The
 * setup gate"): which step a Models/Providers document still needs — or
 * none, when it is satisfied or malformed — and the Add Endpoint prefill.
 */
import { describe, expect, it } from 'vitest';
import { parseEndpointDraft } from '@/components/dialogs/provider-form';
import { DEFAULT_ENDPOINT_PROTOCOL } from '@/llm/protocols/registry';
import {
  DEFAULT_ENDPOINT_URL,
  type Endpoint,
} from '@/llm/provider-document';
import { setupEndpointDraft, setupStep } from './setup-step';

function endpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    id: 'ep-1',
    url: 'http://host:1/v1',
    api: DEFAULT_ENDPOINT_PROTOCOL,
    authRequired: false,
    models: [],
    ...overrides,
  };
}

describe('[G2] setupStep', () => {
  it('asks for an endpoint when the document has none', () => {
    expect(setupStep({ endpoints: [] })).toBe('endpoint');
  });

  it('asks for a model when endpoints exist but none holds a model', () => {
    expect(
      setupStep({
        endpoints: [
          endpoint(),
          endpoint({ id: 'ep-2', url: 'http://host:2/v1' }),
        ],
      }),
    ).toBe('model');
  });

  it('is satisfied by any model anywhere, even beside an empty endpoint', () => {
    expect(
      setupStep({
        endpoints: [
          endpoint(),
          endpoint({
            id: 'ep-2',
            url: 'http://host:2/v1',
            models: [{ modelName: 'm', handle: 'm' }],
          }),
        ],
      }),
    ).toBeNull();
  });

  it('stays closed for a malformed document', () => {
    expect(setupStep(null)).toBeNull();
  });
});

describe('[G2] setupEndpointDraft', () => {
  it('is the LM Studio default and parses as a valid endpoint', () => {
    const draft = setupEndpointDraft();
    expect(draft).toEqual({
      url: DEFAULT_ENDPOINT_URL,
      api: DEFAULT_ENDPOINT_PROTOCOL,
      authRequired: false,
      apiKey: '',
    });
    expect(parseEndpointDraft(draft)).toEqual({
      ok: true,
      input: {
        url: DEFAULT_ENDPOINT_URL,
        api: DEFAULT_ENDPOINT_PROTOCOL,
        authRequired: false,
      },
    });
  });
});
