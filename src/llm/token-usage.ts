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
  throw new Error(`not implemented: getCharsPerToken (${modelName})`);
}

/** Ratio = chars / completionTokens; skipped under the calibration floor. */
export function recordCalibration(
  modelName: string,
  chars: number,
  completionTokens: number,
): void {
  throw new Error(
    `not implemented: recordCalibration (${modelName}, ${chars}, ${completionTokens})`,
  );
}

/** Sum of text and reasoning part lengths — the live estimator's input. */
export function streamedChars(message: UIMessage): number {
  throw new Error(`not implemented: streamedChars (${message.id})`);
}

/** Narrows unknown message metadata; null when absent or malformed. */
export function usageFromMessage(message: UIMessage): UsageMetadata | null {
  throw new Error(`not implemented: usageFromMessage (${message.id})`);
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
  throw new Error(`not implemented: formatTokenReadout (${readout.kind})`);
}
