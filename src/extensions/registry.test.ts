/**
 * [G3] Registry wiring (DESIGN.md "LinkML Graph Viewer"): the graph
 * viewer applies to link-ml units, ordered above the code editor.
 * [G1] validates hooks (DESIGN.md "Revision History & Restore"): the
 * graph viewer judges parseability; extension zero declares no hook.
 */
import { describe, expect, it } from 'vitest';

import { applicableExtensions, extensions } from './registry';

describe('[G3] registry', () => {
  it('link-ml contexts get the graph viewer first; others omit it', () => {
    const linkml = applicableExtensions({
      artifactType: 'yaml',
      configName: 'link-ml',
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

describe('[G1] registry validates', () => {
  const byId = (id: string) => extensions.find((e) => e.id === id);

  it('linkml-graph validates resolves true for parseable YAML', async () => {
    await expect(
      byId('linkml-graph')?.validates?.('classes:\n  Person: {}\n'),
    ).resolves.toBe(true);
  });

  it('linkml-graph validates resolves false for unparseable YAML', async () => {
    await expect(byId('linkml-graph')?.validates?.('a: b: c')).resolves.toBe(
      false,
    );
  });

  it('the code editor declares no validates hook', () => {
    expect(byId('code-editor')?.validates).toBeUndefined();
  });
});
