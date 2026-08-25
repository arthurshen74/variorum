/**
 * The protocol adapter contract (DESIGN.md "LLM Provider Interface",
 * "Protocol adapters"): one adapter per wire protocol under this
 * directory, reached only through registry.ts. An adapter turns a
 * resolved model plus a configuration version into the LanguageModel
 * and the streamText options its protocol needs. Nothing outside this
 * directory names a protocol literal.
 */
import type { LanguageModel } from 'ai';
import type { ConfigurationVersion } from '@/domain/types';

export type ApiProtocol = 'openai-compatible' | 'anthropic-messages';

/** A handle resolved through the Models/Providers document — what an adapter consumes. */
export interface ResolvedModel {
  api: ApiProtocol;
  url: string;
  /** The id that goes on the wire: the row's modelName, never the handle. */
  modelId: string;
  apiKey?: string;
  maxOutputTokens?: number;
}

export interface PreparedRequest {
  model: LanguageModel;
  /** streamText options the protocol adds on top of the recipe. */
  options: { maxOutputTokens?: number; topK?: number };
}

export interface ProtocolAdapter {
  id: ApiProtocol;
  /** Shown beside an endpoint URL in the Models/Providers tree. */
  label: string;
  /** True when the wire makes an output cap mandatory. */
  usesMaxOutputTokens: boolean;
  prepareRequest(
    resolved: ResolvedModel,
    version: ConfigurationVersion,
    fetchImpl: typeof fetch,
  ): PreparedRequest;
}
