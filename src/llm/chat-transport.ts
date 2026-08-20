/**
 * The custom ChatTransport (DESIGN.md "Chat"): calls streamText in the
 * browser against the OpenAI-compatible endpoint — no server route. The
 * request is built from the LATEST SAVED version of the unit's
 * configuration at call time: model id, system prompt, sampling
 * parameters, reasoning effort. Reasoning parts are stripped from the
 * request context (never re-sent). This class is the designated seam: the
 * single file that would change if requests ever routed through a proxy.
 */
import { streamText, toUIMessageStream } from 'ai';
import type {
  ChatTransport,
  TextStreamPart,
  ToolSet,
  UIMessage,
  UIMessageChunk,
} from 'ai';
import { variorumStore } from '@/state/store';
import { selectLatestVersion, selectUnit } from '@/state/selectors';
import type { ConfigurationVersion } from '@/domain/types';
import { toModelMessages } from './mapping';
import type { UsageMetadata } from './token-usage';
import { createProvider } from './transport';

// OpenAI-compatible request body fields the SDK provider will not send:
// it reports topK as unsupported, and reaches reasoning effort only
// through a provider-name-keyed option. Both are spliced in below.
const BODY_TOP_K = 'top_k';
const BODY_REASONING_EFFORT = 'reasoning_effort';

function extraBodyFields(
  version: ConfigurationVersion,
): Record<string, unknown> {
  return {
    ...(version.topK !== undefined ? { [BODY_TOP_K]: version.topK } : {}),
    ...(version.reasoningEffort !== undefined
      ? { [BODY_REASONING_EFFORT]: version.reasoningEffort }
      : {}),
  };
}

/** Wraps fetch to merge extra fields into the JSON request body. */
function withExtraBodyFields(
  base: typeof fetch,
  extra: Record<string, unknown>,
): typeof fetch {
  if (Object.keys(extra).length === 0) return base;
  return async (input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return base(input, {
      ...init,
      body: JSON.stringify({ ...body, ...extra }),
    });
  };
}

// The OpenAI-compatible finish reason for a response the server cut short.
// Exported so the tests that script an endpoint name it from here.
export const FINISH_REASON_LENGTH = 'length';

/**
 * Shown in the transcript's error row. Names the symptom, not a cause:
 * `length` means the server's limits ended the response, and the finish
 * reason alone cannot say whether that was the context window or an
 * output cap.
 */
export const TRUNCATED_RESPONSE_MESSAGE =
  "The response was cut short by the server's limits and was discarded. " +
  'Nothing was saved. Raise the context length (or output limit) on your ' +
  'LLM server, then retry.';

/**
 * Converts a `length` finish into an error chunk: a response the server
 * cut short is a failed request, not a completed one (DESIGN.md "Chat").
 * The finish chunk is dropped so the message never finalizes as a success.
 */
export function failOnTruncation(
  stream: ReadableStream<UIMessageChunk>,
): ReadableStream<UIMessageChunk> {
  return stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        if (
          chunk.type === 'finish' &&
          chunk.finishReason === FINISH_REASON_LENGTH
        ) {
          controller.enqueue({
            type: 'error',
            errorText: TRUNCATED_RESPONSE_MESSAGE,
          });
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

/**
 * Builds the finish chunk's usage metadata (DESIGN.md "Token usage
 * display") from a finish stream part; undefined for every other part
 * and when the provider reported no usage numbers.
 */
export function finishUsageMetadata(
  part: TextStreamPart<ToolSet>,
  modelName: string,
): UsageMetadata | undefined {
  throw new Error(
    `not implemented: finishUsageMetadata (${part.type}, ${modelName})`,
  );
}

export interface ChatTransportDeps {
  /** Injectable for node tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export class VariorumChatTransport implements ChatTransport<UIMessage> {
  constructor(
    readonly unitId: string,
    readonly deps: ChatTransportDeps = {},
  ) {}

  sendMessages(
    options: Parameters<ChatTransport<UIMessage>['sendMessages']>[0],
  ): Promise<ReadableStream<UIMessageChunk>> {
    const version = this.latestVersion();
    const provider = createProvider(
      withExtraBodyFields(
        this.deps.fetchImpl ?? globalThis.fetch,
        extraBodyFields(version),
      ),
    );

    const result = streamText({
      model: provider(version.modelName),
      system: version.systemPrompt,
      messages: toModelMessages(options.messages),
      temperature: version.temperature,
      topP: version.topP,
      abortSignal: options.abortSignal,
      // A failed request is a boundary the user resolves with Retry, not
      // something the SDK re-attempts behind their back — silent retries
      // would hide a down endpoint behind a long pause.
      maxRetries: 0,
    });

    return Promise.resolve(
      failOnTruncation(
        toUIMessageStream({
          stream: result.stream,
          // There is no server here to leak internals to — the endpoint is
          // the user's own, and the error row is only useful if it names
          // the failure.
          onError: (error) =>
            error instanceof Error ? error.message : String(error),
        }),
      ),
    );
  }

  /** No server holds streams for us — always resolves null. */
  reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return Promise.resolve(null);
  }

  /** Read at call time: a Save between sends changes the next request. */
  private latestVersion(): ConfigurationVersion {
    const state = variorumStore.getState();
    const unit = selectUnit(this.unitId)(state);
    if (unit === undefined) {
      throw new Error(`unknown unit: ${this.unitId}`);
    }
    const version = selectLatestVersion(unit.configName)(state);
    if (version === undefined) {
      throw new Error(`configuration has no versions: ${unit.configName}`);
    }
    return version;
  }
}
