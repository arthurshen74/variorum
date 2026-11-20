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
import { boundHandles } from '@/llm/resolve-model';

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
  const handles = document === null ? [] : boundHandles(document);
  if (handles.includes(version.modelName)) return null;
  return { designator: `${version.name}.${version.version + 1}`, handles };
}

/** The version's recipe with only the model handle replaced. */
export function rebindDraft(
  version: ConfigurationVersion,
  handle: string,
): ConfigurationDraft {
  // Rest, not a field list: a recipe field added later carries over too.
  const { name, version: number, ...recipe } = version;
  return { ...recipe, modelName: handle };
}

/**
 * New Unit's Create. With a handle, saves the rebound draft as the next
 * version and only then creates the unit; a null handle means the
 * configuration is already bound and only the unit is created.
 */
export async function createUnitWithModel(
  ports: ModelChoicePorts,
  conversationName: string,
  version: ConfigurationVersion,
  handle: string | null,
): Promise<Unit> {
  if (handle !== null) {
    await ports.saveConfigurationVersion(
      version.name,
      rebindDraft(version, handle),
    );
  }
  return ports.createUnit(conversationName, version.name);
}
