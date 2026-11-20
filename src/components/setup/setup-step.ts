/**
 * The setup gate's decisions (DESIGN.md "First-Run Setup", "The setup
 * gate"): which step a Models/Providers document still needs, and the
 * Add Endpoint prefill. Pure — the gate owns document access and holds
 * the document in component state.
 */
import {
  blankEndpointDraft,
  type EndpointDraft,
} from '@/components/dialogs/provider-form';
import {
  DEFAULT_ENDPOINT_URL,
  type ProviderDocument,
} from '@/llm/provider-document';

export type SetupStep = 'endpoint' | 'model';

/**
 * The step the gate must show. Null means the gate stays closed: the
 * document holds an endpoint and a model, or it is malformed (passed as
 * null) and the gate cannot tell which step is missing.
 */
export function setupStep(document: ProviderDocument | null): SetupStep | null {
  if (document === null) return null;
  if (document.endpoints.length === 0) return 'endpoint';
  const hasModel = document.endpoints.some((e) => e.models.length > 0);
  return hasModel ? null : 'model';
}

/** The Add Endpoint prefill: LM Studio's default, nothing stored. */
export function setupEndpointDraft(): EndpointDraft {
  return { ...blankEndpointDraft(), url: DEFAULT_ENDPOINT_URL };
}
