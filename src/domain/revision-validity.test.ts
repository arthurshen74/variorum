/**
 * [G1] Target selection for restore-last-valid (DESIGN.md "Revision
 * History & Restore"): newest revision that validates wins, scan stops
 * on the first hit, none found is null.
 */
import { describe, expect, it, vi } from 'vitest';

import type { Artifact } from '@design/repository-api';
import { findLastValid } from './revision-validity';

function artifact(version: number, content: string): Artifact {
  return {
    version,
    savedAt: `2026-08-07T00:0${version}:00.000Z`,
    source: 'manual',
    content,
  };
}

const validatesOk = (content: string) => Promise.resolve(content === 'ok');

describe('[G1] findLastValid', () => {
  it('returns the newest artifact that validates', async () => {
    const artifacts = [
      artifact(1, 'ok'),
      artifact(2, 'ok'),
      artifact(3, 'bad'),
    ];
    const found = await findLastValid(artifacts, validatesOk);
    expect(found?.version).toBe(2);
  });

  it('returns the latest when the latest validates', async () => {
    const artifacts = [artifact(1, 'bad'), artifact(2, 'ok')];
    const found = await findLastValid(artifacts, validatesOk);
    expect(found?.version).toBe(2);
  });

  it('returns null when no revision validates', async () => {
    const artifacts = [artifact(1, 'bad'), artifact(2, 'also bad')];
    expect(await findLastValid(artifacts, validatesOk)).toBeNull();
  });

  it('returns null for an empty history', async () => {
    expect(await findLastValid([], validatesOk)).toBeNull();
  });

  it('stops probing once found', async () => {
    const validates = vi.fn(validatesOk);
    const artifacts = [
      artifact(1, 'ok'),
      artifact(2, 'ok'),
      artifact(3, 'bad'),
    ];
    await findLastValid(artifacts, validates);
    expect(validates.mock.calls.map(([content]) => content)).toEqual([
      'bad',
      'ok',
    ]);
  });
});
