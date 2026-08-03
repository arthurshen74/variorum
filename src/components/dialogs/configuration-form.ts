/**
 * Pure form logic for the Configurations dialog (DESIGN.md "Management
 * UI"): boundary validation, the Edit-view prefill, and the mint-or-not
 * comparison behind Save. No React, no IO — the dialog component owns
 * the fields; this module owns what they mean.
 */
import type {
  Configuration,
  ConfigurationDraft,
  ConfigurationVersion,
  NewConfigurationInfo,
} from '@/domain/types';

/** Slider stop → reasoningEffort; stop 0 = unset (reasoning off). */
export const REASONING_EFFORT_STOPS = [
  undefined,
  'low',
  'medium',
  'high',
] as const;

/** Free-text numeric fields; blank means unset. */
const SAMPLING_FIELDS = ['temperature', 'topP', 'topK'] as const;

const REQUIRED_MESSAGE = 'Required';
const NUMERIC_MESSAGE = 'Must be a number';

/** Raw form state: text fields as typed, slider as stop index. */
export interface ConfigurationFormValues {
  name: string;
  description: string;
  artifactType: string;
  modelName: string;
  systemPrompt: string;
  temperature: string; // free text; blank = unset
  topP: string;
  topK: string;
  reasoningIndex: number; // 0..3 into REASONING_EFFORT_STOPS
}

export type ConfigurationFormResult =
  | { ok: true; info: NewConfigurationInfo; draft: ConfigurationDraft }
  | { ok: false; errors: Partial<Record<keyof ConfigurationFormValues, string>> };

/** Boundary validation: required fields, numeric parses, unset semantics. */
export function parseConfigurationForm(
  values: ConfigurationFormValues,
): ConfigurationFormResult {
  const errors: Partial<Record<keyof ConfigurationFormValues, string>> = {};

  const name = values.name.trim();
  const artifactType = values.artifactType.trim();
  const modelName = values.modelName.trim();
  if (!name) errors.name = REQUIRED_MESSAGE;
  if (!artifactType) errors.artifactType = REQUIRED_MESSAGE;
  if (!modelName) errors.modelName = REQUIRED_MESSAGE;

  // Blank leaves the key off entirely, which is how a sampling parameter
  // stays out of the version record and out of the request.
  const sampling: Partial<Record<(typeof SAMPLING_FIELDS)[number], number>> = {};
  for (const field of SAMPLING_FIELDS) {
    const text = values[field].trim();
    if (!text) continue;
    const parsed = Number(text);
    if (Number.isNaN(parsed)) errors[field] = NUMERIC_MESSAGE;
    else sampling[field] = parsed;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const description = values.description.trim();
  const reasoningEffort = REASONING_EFFORT_STOPS[values.reasoningIndex];

  return {
    ok: true,
    info: {
      name,
      artifactType,
      ...(description ? { description } : {}),
    },
    draft: {
      modelName,
      systemPrompt: values.systemPrompt,
      ...sampling,
      ...(reasoningEffort ? { reasoningEffort } : {}),
    },
  };
}

/** Prefill for the Edit view from the latest saved version. */
export function formValuesFromVersion(
  configuration: Configuration,
  version: ConfigurationVersion,
): ConfigurationFormValues {
  return {
    name: configuration.name,
    description: configuration.description ?? '',
    artifactType: configuration.artifactType,
    modelName: version.modelName,
    systemPrompt: version.systemPrompt,
    temperature: numberField(version.temperature),
    topP: numberField(version.topP),
    topK: numberField(version.topK),
    // An effort the slider has no stop for (an imported dump can carry one)
    // prefills as unset rather than as an out-of-range stop.
    reasoningIndex: Math.max(
      0,
      REASONING_EFFORT_STOPS.findIndex(
        (stop) => stop === version.reasoningEffort,
      ),
    ),
  };
}

function numberField(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

/** The mint-or-not comparison behind Edit's Save. */
export function draftEqualsVersion(
  draft: ConfigurationDraft,
  version: ConfigurationVersion,
): boolean {
  return (
    draft.modelName === version.modelName &&
    draft.systemPrompt === version.systemPrompt &&
    draft.temperature === version.temperature &&
    draft.topP === version.topP &&
    draft.topK === version.topK &&
    draft.reasoningEffort === version.reasoningEffort
  );
}
