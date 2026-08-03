/**
 * Unit tests for the Configurations dialog's pure form logic (DESIGN.md
 * "Management UI"): boundary validation, Edit prefill, mint-or-not
 * comparison. The dialog wiring is covered by e2e/management-ui.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import type { Configuration, ConfigurationVersion } from '@/domain/types';
import {
  draftEqualsVersion,
  formValuesFromVersion,
  parseConfigurationForm,
  type ConfigurationFormValues,
} from './configuration-form';

const filledValues: ConfigurationFormValues = {
  name: 'linkml',
  description: 'LinkML schemas',
  artifactType: 'yaml',
  modelName: 'qwen/qwen3-14b',
  systemPrompt: 'You produce LinkML.',
  temperature: '0.7',
  topP: '0.9',
  topK: '40',
  reasoningIndex: 2,
};

const configuration: Configuration = {
  name: 'linkml',
  description: 'LinkML schemas',
  artifactType: 'yaml',
  archived: false,
};

const fullVersion: ConfigurationVersion = {
  name: 'linkml',
  version: 3,
  modelName: 'qwen/qwen3-14b',
  systemPrompt: 'You produce LinkML.',
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  reasoningEffort: 'medium',
};

const minimalVersion: ConfigurationVersion = {
  name: 'linkml',
  version: 1,
  modelName: 'qwen/qwen3-14b',
  systemPrompt: '',
};

describe('[G1] parseConfigurationForm', () => {
  it('parses a fully filled form to info + draft with numeric fields as numbers', () => {
    const result = parseConfigurationForm(filledValues);
    expect(result).toEqual({
      ok: true,
      info: {
        name: 'linkml',
        description: 'LinkML schemas',
        artifactType: 'yaml',
      },
      draft: {
        modelName: 'qwen/qwen3-14b',
        systemPrompt: 'You produce LinkML.',
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        reasoningEffort: 'medium',
      },
    });
  });

  it('parses blank sampling fields to a draft with temperature/topP/topK omitted', () => {
    const result = parseConfigurationForm({
      ...filledValues,
      temperature: '',
      topP: '',
      topK: '',
    });
    if (!result.ok) throw new Error('expected ok');
    expect(result.draft.temperature).toBeUndefined();
    expect(result.draft.topP).toBeUndefined();
    expect(result.draft.topK).toBeUndefined();
    expect('temperature' in result.draft).toBe(false);
    expect('topP' in result.draft).toBe(false);
    expect('topK' in result.draft).toBe(false);
  });

  it('maps reasoning stop 0 to an omitted reasoningEffort and stops 1-3 to low/medium/high', () => {
    const at = (reasoningIndex: number) => {
      const result = parseConfigurationForm({ ...filledValues, reasoningIndex });
      if (!result.ok) throw new Error('expected ok');
      return result.draft;
    };
    expect('reasoningEffort' in at(0)).toBe(false);
    expect(at(1).reasoningEffort).toBe('low');
    expect(at(2).reasoningEffort).toBe('medium');
    expect(at(3).reasoningEffort).toBe('high');
  });

  it('rejects an empty name with an error keyed to name', () => {
    const result = parseConfigurationForm({ ...filledValues, name: '' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors.name).toBeTruthy();
  });

  it('rejects an empty artifactType with an error keyed to artifactType', () => {
    const result = parseConfigurationForm({ ...filledValues, artifactType: '' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors.artifactType).toBeTruthy();
  });

  it('rejects an empty modelName with an error keyed to modelName', () => {
    const result = parseConfigurationForm({ ...filledValues, modelName: '' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors.modelName).toBeTruthy();
  });

  it('trims whitespace-only required fields and rejects them', () => {
    const result = parseConfigurationForm({
      ...filledValues,
      name: '   ',
      artifactType: '\t',
      modelName: '  ',
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors.name).toBeTruthy();
    expect(result.errors.artifactType).toBeTruthy();
    expect(result.errors.modelName).toBeTruthy();
  });

  it('rejects non-numeric sampling fields with errors keyed to each field', () => {
    const result = parseConfigurationForm({
      ...filledValues,
      temperature: 'warm',
      topP: 'most',
      topK: 'some',
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.errors.temperature).toBeTruthy();
    expect(result.errors.topP).toBeTruthy();
    expect(result.errors.topK).toBeTruthy();
  });
});

describe('[G1] formValuesFromVersion', () => {
  it('round-trips: prefilled values parse back to a draft equal to the version', () => {
    const values = formValuesFromVersion(configuration, fullVersion);
    const result = parseConfigurationForm(values);
    if (!result.ok) throw new Error('expected ok');
    expect(result.draft).toEqual({
      modelName: fullVersion.modelName,
      systemPrompt: fullVersion.systemPrompt,
      temperature: fullVersion.temperature,
      topP: fullVersion.topP,
      topK: fullVersion.topK,
      reasoningEffort: fullVersion.reasoningEffort,
    });
    expect(result.info).toEqual({
      name: configuration.name,
      description: configuration.description,
      artifactType: configuration.artifactType,
    });
  });

  it('prefills blank strings and reasoning stop 0 from a version with no optional fields', () => {
    const values = formValuesFromVersion(configuration, minimalVersion);
    expect(values.temperature).toBe('');
    expect(values.topP).toBe('');
    expect(values.topK).toBe('');
    expect(values.reasoningIndex).toBe(0);
  });
});

describe('[G1] draftEqualsVersion', () => {
  const fullDraft = {
    modelName: 'qwen/qwen3-14b',
    systemPrompt: 'You produce LinkML.',
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    reasoningEffort: 'medium',
  };

  it('returns true for an identical recipe', () => {
    expect(draftEqualsVersion(fullDraft, fullVersion)).toBe(true);
  });

  it('returns false for a change in each recipe field, including set-vs-unset', () => {
    expect(
      draftEqualsVersion({ ...fullDraft, modelName: 'other' }, fullVersion),
    ).toBe(false);
    expect(
      draftEqualsVersion({ ...fullDraft, systemPrompt: 'changed' }, fullVersion),
    ).toBe(false);
    expect(
      draftEqualsVersion({ ...fullDraft, temperature: 0.8 }, fullVersion),
    ).toBe(false);
    expect(
      draftEqualsVersion({ ...fullDraft, topP: undefined }, fullVersion),
    ).toBe(false);
    expect(
      draftEqualsVersion({ ...fullDraft, topK: 41 }, fullVersion),
    ).toBe(false);
    expect(
      draftEqualsVersion({ ...fullDraft, reasoningEffort: undefined }, fullVersion),
    ).toBe(false);
  });
});
