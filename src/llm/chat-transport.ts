/**
 * The custom ChatTransport (DESIGN.md "Chat"): calls streamText in the
 * browser against the endpoint the configuration's model handle resolves
 * to — no server route. The request is built from the LATEST SAVED
 * version of the unit's configuration at call time (handle, system
 * prompt, sampling parameters, reasoning effort) and from the
 * Models/Providers document, read at the same moment (DESIGN.md "Models
 * and Providers"); the protocol adapter the resolved endpoint names
 * turns the two into the request. Reasoning parts are stripped from the
 * request context (never re-sent). This class is the designated seam:
 * the single file that would change if requests ever routed through a
 * proxy.
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
import type { PreparedRequest } from './protocols/adapter';
import { protocolAdapter } from './protocols/registry';
import { readProviderDocument } from './provider-document';
import { resolveModel } from './resolve-model';

/**
 * Handle to request, entirely at call time: a document edit between sends
 * changes the next request's endpoint, protocol and key.
 */
function prepareRequest(
  version: ConfigurationVersion,
  fetchImpl: typeof fetch,
): PreparedRequest {
  const resolved = resolveModel(readProviderDocument(), version.modelName);
  return protocolAdapter(resolved.api).prepareRequest(
    resolved,
    version,
    fetchImpl,
  );
}

/** A one-chunk stream carrying a failure that never reached the network. */
function errorChunkStream(errorText: string): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: 'error', errorText });
      controller.close();
    },
  });
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
  if (part.type !== 'finish') return undefined;

  // All three or nothing: the settled readout shows prompt, completion and
  // total together, so a half-reported payload would render a wrong total.
  const { inputTokens, outputTokens, totalTokens } = part.totalUsage;
  if (
    inputTokens === undefined ||
    outputTokens === undefined ||
    totalTokens === undefined
  ) {
    return undefined;
  }
  return { modelName, usage: { inputTokens, outputTokens, totalTokens } };
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
    const fetchImpl = this.deps.fetchImpl ?? globalThis.fetch;

    let prepared: PreparedRequest;
    try {
      prepared = prepareRequest(version, fetchImpl);
    } catch (error) {
      // A malformed document or a handle that does not resolve is the same
      // error row as a failed request, so fixing the tree and pressing
      // Retry is the whole recovery (DESIGN.md "Chat", Errors).
      return Promise.resolve(
        errorChunkStream(
          error instanceof Error ? error.message : String(error),
        ),
      );
    }

    const result = streamText({
      model: prepared.model,
      system: version.systemPrompt,
      messages: toModelMessages(options.messages),
      temperature: version.temperature,
      topP: version.topP,
      // The output cap and topK routing are the adapter's, not the recipe's:
      // what each wire makes mandatory or gates by model id.
      ...prepared.options,
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
          messageMetadata: ({ part }) =>
            finishUsageMetadata(part, version.modelName),
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
