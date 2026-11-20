/**
 * The setup gate's decisions (DESIGN.md "First-Run Setup", "The setup
 * gate"): which step a Models/Providers document still needs, and the
 * Add Endpoint prefill. Pure — the gate owns document access and holds
 * the document in component state.
 */
import type { EndpointDraft } from '@/components/dialogs/provider-form';
import type { ProviderDocument } from '@/llm/provider-document';

export type SetupStep = 'endpoint' | 'model';

/**
 * The step the gate must show. Null means the gate stays closed: the
 * document holds an endpoint and a model, or it is malformed (passed as
 * null) and the gate cannot tell which step is missing.
 */
export function setupStep(document: ProviderDocument | null): SetupStep | null {
  void document;
  throw new Error('not implemented: setupStep');
}

/** The Add Endpoint prefill: LM Studio's default, nothing stored. */
export function setupEndpointDraft(): EndpointDraft {
  throw new Error('not implemented: setupEndpointDraft');
}
