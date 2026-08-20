/**
 * Token usage estimation and calibration (DESIGN.md "Token usage
 * display"). The live count is streamed characters over a per-model
 * chars-per-token ratio; the ratio is device state in localStorage,
 * calibrated from each completed exchange's exact usage. Nothing here
 * touches the Zustand store or the repository — the readout is
 * session-ephemeral narration, never part of the record.
 */
import type { UIMessage } from 'ai';

export const TOKEN_RATIO_KEY_PREFIX = 'variorum.tokenRatio.';
export const DEFAULT_CHARS_PER_TOKEN = 4;
export const CALIBRATION_MIN_TOKENS = 25;

// The UI is English-only; a locale-sensitive format would make the
// separator depend on the machine the app runs on.
const TOKEN_COUNT_FORMAT = new Intl.NumberFormat('en-US');

/** The server's exact figures from the terminal usage chunk. */
export interface ExchangeUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** Crosses the boundary as UI message metadata on the finish chunk. */
export interface UsageMetadata {
  modelName: string;
  usage: ExchangeUsage;
}

/** Stored ratio for the model, or the stock default. */
export function getCharsPerToken(modelName: string): number {
  const stored = localStorage.getItem(TOKEN_RATIO_KEY_PREFIX + modelName);
  if (stored === null) return DEFAULT_CHARS_PER_TOKEN;

  const ratio = Number(stored);
  if (!Number.isFinite(ratio) || ratio <= 0) return DEFAULT_CHARS_PER_TOKEN;
  return ratio;
}

/** Ratio = chars / completionTokens; skipped under the calibration floor. */
export function recordCalibration(
  modelName: string,
  chars: number,
  completionTokens: number,
): void {
  if (completionTokens < CALIBRATION_MIN_TOKENS) return;
  localStorage.setItem(
    TOKEN_RATIO_KEY_PREFIX + modelName,
    String(chars / completionTokens),
  );
}

/** Sum of text and reasoning part lengths — the live estimator's input. */
export function streamedChars(message: UIMessage): number {
  return message.parts.reduce(
    (total, part) =>
      part.type === 'text' || part.type === 'reasoning' ?
        total + part.text.length
      : total,
    0,
  );
}

/** Narrows unknown message metadata; null when absent or malformed. */
export function usageFromMessage(message: UIMessage): UsageMetadata | null {
  const metadata = message.metadata;
  if (typeof metadata !== 'object' || metadata === null) return null;

  const { modelName, usage } = metadata as Record<string, unknown>;
  if (typeof modelName !== 'string') return null;
  if (typeof usage !== 'object' || usage === null) return null;

  const { inputTokens, outputTokens, totalTokens } = usage as Record<
    string,
    unknown
  >;
  if (
    typeof inputTokens !== 'number' ||
    typeof outputTokens !== 'number' ||
    typeof totalTokens !== 'number'
  ) {
    return null;
  }
  return { modelName, usage: { inputTokens, outputTokens, totalTokens } };
}

export type TokenReadout =
  | { kind: 'idle' }
  | {
      kind: 'estimating';
      baselineTokens: number | null;
      streamedChars: number;
      charsPerToken: number;
    }
  | { kind: 'settled'; usage: ExchangeUsage };

/** The display string; empty means the slot renders nothing. */
export function formatTokenReadout(readout: TokenReadout): string {
  if (readout.kind === 'idle') return '';

  if (readout.kind === 'settled') {
    const { inputTokens, outputTokens, totalTokens } = readout.usage;
    return `${count(totalTokens)} tokens · ${count(inputTokens)} in + ${count(outputTokens)} out`;
  }

  const streamed = Math.round(readout.streamedChars / readout.charsPerToken);
  if (readout.baselineTokens === null) {
    return `Tokens out: ≈${count(streamed)}`;
  }
  return `Context Tokens: ≈${count(readout.baselineTokens + streamed)}`;
}

function count(tokens: number): string {
  return TOKEN_COUNT_FORMAT.format(tokens);
}
