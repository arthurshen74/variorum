/**
 * [G1] The protocol registry (DESIGN.md "LLM Provider Interface",
 * "Protocol adapters"): THE list of protocols, the boundary guard over
 * it, and the lookup the transport and the forms share.
 */
import { describe, expect, it } from 'vitest';
import { apiProtocols, isApiProtocol, protocolAdapter } from './registry';

describe('[G1] protocol registry', () => {
  it('apiProtocols lists exactly openai-compatible then anthropic-messages', () => {
    expect(apiProtocols()).toEqual(['openai-compatible', 'anthropic-messages']);
  });

  it('isApiProtocol accepts registry ids and rejects vendor names, empty strings, non-strings', () => {
    expect(isApiProtocol('openai-compatible')).toBe(true);
    expect(isApiProtocol('anthropic-messages')).toBe(true);
    for (const bad of [
      'lm-studio',
      'groq',
      'openai-responses',
      'OpenAI-Compatible',
      '',
      42,
      null,
      undefined,
      {},
    ]) {
      expect(isApiProtocol(bad)).toBe(false);
    }
  });

  it('protocolAdapter returns the adapter whose id matches, with its label', () => {
    const openai = protocolAdapter('openai-compatible');
    expect(openai.id).toBe('openai-compatible');
    expect(openai.label).toBe('OpenAI Chat Completions');

    const anthropic = protocolAdapter('anthropic-messages');
    expect(anthropic.id).toBe('anthropic-messages');
    expect(anthropic.label).toBe('Anthropic Messages');
  });

  it('usesMaxOutputTokens is false for openai-compatible, true for anthropic-messages', () => {
    expect(protocolAdapter('openai-compatible').usesMaxOutputTokens).toBe(
      false,
    );
    expect(protocolAdapter('anthropic-messages').usesMaxOutputTokens).toBe(
      true,
    );
  });
});
