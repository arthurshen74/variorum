/**
 * Target selection for "restore last valid revision" (DESIGN.md
 * "Revision History & Restore"). Pure: takes the revision list and a
 * validates callback, knows nothing about extensions or the repository.
 */
import type { Artifact } from '@design/repository-api';

/** The newest artifact whose content validates, or null if none does. */
export async function findLastValid(
  _artifacts: Artifact[],
  _validates: (content: string) => Promise<boolean>,
): Promise<Artifact | null> {
  throw new Error('not implemented: findLastValid');
}
