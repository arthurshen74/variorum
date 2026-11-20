/**
 * Choosing a model at use (DESIGN.md "First-Run Setup", "Choosing a model
 * at use"): what the model-choice control offers for a configuration
 * whose handle this machine has not bound, the draft its Save mints, and
 * the New Unit ordering — version first, then unit. Pure, ports-in: the
 * repository arrives as an injected object.
 */
import type {
  ConfigurationDraft,
  ConfigurationVersion,
  Unit,
} from '@/domain/types';
import type { ProviderDocument } from '@/llm/provider-document';

export interface ModelChoice {
  /** The version the Save will mint, as `name.N`. */
  designator: string;
  /** The handles the document binds, in document order. */
  handles: string[];
}

/** The slice of the repository the New Unit Create drives. */
export interface ModelChoicePorts {
  saveConfigurationVersion(
    name: string,
    draft: ConfigurationDraft,
  ): Promise<ConfigurationVersion>;
  createUnit(conversationName: string, configName: string): Promise<Unit>;
}

/**
 * What the control must offer for a configuration's latest version. Null
 * when its handle is bound: nothing to choose. A malformed document
 * (passed as null) cannot show the handle bound, so it offers no handles.
 */
export function modelChoiceFor(
  version: ConfigurationVersion,
  document: ProviderDocument | null,
): ModelChoice | null {
  void version;
  void document;
  throw new Error('not implemented: modelChoiceFor');
}

/** The version's recipe with only the model handle replaced. */
export function rebindDraft(
  version: ConfigurationVersion,
  handle: string,
): ConfigurationDraft {
  void version;
  void handle;
  throw new Error('not implemented: rebindDraft');
}

/**
 * New Unit's Create. With a handle, saves the rebound draft as the next
 * version and only then creates the unit; a null handle means the
 * configuration is already bound and only the unit is created.
 */
export function createUnitWithModel(
  ports: ModelChoicePorts,
  conversationName: string,
  version: ConfigurationVersion,
  handle: string | null,
): Promise<Unit> {
  void ports;
  void conversationName;
  void version;
  void handle;
  throw new Error('not implemented: createUnitWithModel');
}
