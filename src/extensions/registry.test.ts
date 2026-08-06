/**
 * [G3] Registry wiring (DESIGN.md "LinkML Graph Viewer"): the graph
 * viewer applies to linkml units, ordered above the code editor.
 */
import { describe, expect, it } from 'vitest';

import { applicableExtensions } from './registry';

describe('[G3] registry', () => {
  it('linkml contexts get the graph viewer first; others omit it', () => {
    const linkml = applicableExtensions({
      artifactType: 'yaml',
      configName: 'linkml',
      unitId: 'u1',
    }).map((e) => e.id);
    expect(linkml).toEqual(['linkml-graph', 'code-editor']);

    const other = applicableExtensions({
      artifactType: 'markdown',
      configName: 'notes',
      unitId: 'u1',
    }).map((e) => e.id);
    expect(other).toEqual(['code-editor']);
  });
});
