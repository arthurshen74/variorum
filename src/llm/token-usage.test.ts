/**
 * [G1] The token-usage mechanism (DESIGN.md "Token usage display"):
 * per-model chars-per-token calibration in localStorage, the streamed
 * character count, metadata narrowing at the boundary, and the readout
 * display grammar. Filter by file — older manifests reuse the [G1] tag.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import {
  CALIBRATION_MIN_TOKENS,
  DEFAULT_CHARS_PER_TOKEN,
  TOKEN_RATIO_KEY_PREFIX,
  formatTokenReadout,
  getCharsPerToken,
  recordCalibration,
  streamedChars,
  usageFromMessage,
} from './token-usage';

// node has no localStorage; the calibration lives there as device state.
const storage = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
};

beforeEach(() => {
  storage.clear();
});

describe('[G1] calibration', () => {
  it('returns the stock default when nothing is stored', () => {
    expect(getCharsPerToken('never-seen-model')).toBe(DEFAULT_CHARS_PER_TOKEN);
  });

  it('stores chars over tokens and reads it back', () => {
    recordCalibration('qwen/qwen3', 340, 100);
    expect(getCharsPerToken('qwen/qwen3')).toBe(3.4);
    expect(storage.has(`${TOKEN_RATIO_KEY_PREFIX}qwen/qwen3`)).toBe(true);
  });

  it('is keyed per model — two models calibrate independently', () => {
    recordCalibration('model-a', 340, 100);
    recordCalibration('model-b', 200, 100);
    expect(getCharsPerToken('model-a')).toBe(3.4);
    expect(getCharsPerToken('model-b')).toBe(2);
  });

  it('skips a response under the calibration floor', () => {
    recordCalibration('m', 100, CALIBRATION_MIN_TOKENS - 1);
    expect(getCharsPerToken('m')).toBe(DEFAULT_CHARS_PER_TOKEN);
  });

  it('accepts a response of exactly the calibration floor', () => {
    recordCalibration('m', 75, CALIBRATION_MIN_TOKENS);
    expect(getCharsPerToken('m')).toBe(3);
  });

  it('falls back to the default on a malformed stored value', () => {
    storage.set(`${TOKEN_RATIO_KEY_PREFIX}m`, 'not-a-number');
    expect(getCharsPerToken('m')).toBe(DEFAULT_CHARS_PER_TOKEN);
  });

  it('falls back to the default on a non-positive stored value', () => {
    storage.set(`${TOKEN_RATIO_KEY_PREFIX}m`, '0');
    expect(getCharsPerToken('m')).toBe(DEFAULT_CHARS_PER_TOKEN);
  });
});

describe('[G1] streamedChars', () => {
  it('sums text and reasoning part lengths', () => {
    const message: UIMessage = {
      id: 'a1',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'because' },
        { type: 'text', text: 'Hello' },
      ],
    };
    expect(streamedChars(message)).toBe(12);
  });

  it('is zero when a message has no text or reasoning parts', () => {
    const message: UIMessage = {
      id: 'a1',
      role: 'assistant',
      parts: [{ type: 'step-start' }],
    };
    expect(streamedChars(message)).toBe(0);
  });
});

describe('[G1] usageFromMessage', () => {
  const assistant = (metadata: unknown): UIMessage => ({
    id: 'a1',
    role: 'assistant',
    parts: [{ type: 'text', text: 'done' }],
    metadata,
  });

  it('narrows valid finish metadata', () => {
    const message = assistant({
      modelName: 'qwen/qwen3',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    expect(usageFromMessage(message)).toEqual({
      modelName: 'qwen/qwen3',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
  });

  it('returns null when metadata is absent', () => {
    expect(usageFromMessage(assistant(undefined))).toBeNull();
  });

  it('returns null when a usage field is missing or mistyped', () => {
    expect(
      usageFromMessage(
        assistant({
          modelName: 'm',
          usage: { inputTokens: '100', outputTokens: 50, totalTokens: 150 },
        }),
      ),
    ).toBeNull();
    expect(
      usageFromMessage(
        assistant({
          modelName: 'm',
          usage: { outputTokens: 50, totalTokens: 150 },
        }),
      ),
    ).toBeNull();
  });
});

describe('[G1] formatTokenReadout', () => {
  it('formats idle as the empty string', () => {
    expect(formatTokenReadout({ kind: 'idle' })).toBe('');
  });

  it('formats a baseline with zero chars as tokens in context', () => {
    expect(
      formatTokenReadout({
        kind: 'estimating',
        baselineTokens: 100,
        streamedChars: 0,
        charsPerToken: 4,
      }),
    ).toBe('Context Tokens: ≈100');
  });

  it('adds the rounded char estimate to the baseline', () => {
    expect(
      formatTokenReadout({
        kind: 'estimating',
        baselineTokens: 100,
        streamedChars: 42,
        charsPerToken: 4,
      }),
    ).toBe('Context Tokens: ≈111');
  });

  it('formats a missing baseline as tokens out', () => {
    expect(
      formatTokenReadout({
        kind: 'estimating',
        baselineTokens: null,
        streamedChars: 200,
        charsPerToken: 4,
      }),
    ).toBe('Tokens out: ≈50');
  });

  it('formats settled usage with the exact split', () => {
    expect(
      formatTokenReadout({
        kind: 'settled',
        usage: { inputTokens: 4, outputTokens: 8187, totalTokens: 8191 },
      }),
    ).toBe('8,191 tokens · 4 in + 8,187 out');
  });

  it('separates thousands in the estimate', () => {
    expect(
      formatTokenReadout({
        kind: 'estimating',
        baselineTokens: 8191,
        streamedChars: 0,
        charsPerToken: 4,
      }),
    ).toBe('Context Tokens: ≈8,191');
  });
});
