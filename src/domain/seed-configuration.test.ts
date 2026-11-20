/**
 * [G1] The built-in configuration's content (DESIGN.md "First-Run Setup",
 * "The built-in configuration"): the name record, the version-1 recipe,
 * and the rule that the seed module holds a configuration and nothing
 * else.
 */
import { describe, expect, it } from 'vitest';
import * as seedModule from './seed-configuration';
import {
  BUILT_IN_CONFIGURATION_DRAFT,
  BUILT_IN_CONFIGURATION_INFO,
  BUILT_IN_CONFIGURATION_NAME,
} from './seed-configuration';

describe('[G1] the built-in configuration seed', () => {
  it('is named link-ml, artifact type yaml, with a description', () => {
    expect(BUILT_IN_CONFIGURATION_NAME).toBe('link-ml');
    expect(BUILT_IN_CONFIGURATION_INFO.name).toBe(BUILT_IN_CONFIGURATION_NAME);
    expect(BUILT_IN_CONFIGURATION_INFO.artifactType).toBe('yaml');
    expect(BUILT_IN_CONFIGURATION_INFO.description?.trim()).not.toBe('');
    expect(BUILT_IN_CONFIGURATION_INFO.description).toBeDefined();
  });

  it('carries temperature 0, top_p 0.95, reasoning effort high, no top_k, and a model name', () => {
    expect(BUILT_IN_CONFIGURATION_DRAFT.temperature).toBe(0);
    expect(BUILT_IN_CONFIGURATION_DRAFT.topP).toBe(0.95);
    expect(BUILT_IN_CONFIGURATION_DRAFT.reasoningEffort).toBe('high');
    expect(BUILT_IN_CONFIGURATION_DRAFT).not.toHaveProperty('topK');
    expect(BUILT_IN_CONFIGURATION_DRAFT.modelName.trim()).not.toBe('');
  });

  it('teaches the yaml artifact fence marker in its system prompt', () => {
    expect(BUILT_IN_CONFIGURATION_DRAFT.systemPrompt).toContain(
      '"yaml artifact"',
    );
  });

  it('exports exactly the three constants, with nowhere to put a unit', () => {
    expect(Object.keys(seedModule).sort()).toEqual([
      'BUILT_IN_CONFIGURATION_DRAFT',
      'BUILT_IN_CONFIGURATION_INFO',
      'BUILT_IN_CONFIGURATION_NAME',
    ]);
    expect(Object.keys(BUILT_IN_CONFIGURATION_INFO).sort()).toEqual([
      'artifactType',
      'description',
      'name',
    ]);
    expect(Object.keys(BUILT_IN_CONFIGURATION_DRAFT).sort()).toEqual([
      'modelName',
      'reasoningEffort',
      'systemPrompt',
      'temperature',
      'topP',
    ]);
  });
});
