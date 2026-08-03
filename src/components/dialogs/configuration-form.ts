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
  _values: ConfigurationFormValues,
): ConfigurationFormResult {
  throw new Error('not implemented: parseConfigurationForm');
}

/** Prefill for the Edit view from the latest saved version. */
export function formValuesFromVersion(
  _configuration: Configuration,
  _version: ConfigurationVersion,
): ConfigurationFormValues {
  throw new Error('not implemented: formValuesFromVersion');
}

/** The mint-or-not comparison behind Edit's Save. */
export function draftEqualsVersion(
  _draft: ConfigurationDraft,
  _version: ConfigurationVersion,
): boolean {
  throw new Error('not implemented: draftEqualsVersion');
}
