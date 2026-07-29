/**
 * Domain types. The canon lives in design/repository-api.ts (which mirrors
 * design/application-schema.yaml) — this module re-exports it so app code
 * imports from `@/domain/types` and the design folder stays the single
 * source of truth.
 */
export type {
  MessageRole,
  ArtifactSource,
  Configuration,
  ConfigurationVersion,
  Message,
  Artifact,
  Unit,
  DatabaseDump,
  ImportReport,
  ConfigurationDraft,
  NewConfigurationInfo,
  AssistantCompletion,
  VariorumRepository,
} from '@design/repository-api';

/** Version stamped into export dumps so import can migrate. */
export const SCHEMA_VERSION = 1;
