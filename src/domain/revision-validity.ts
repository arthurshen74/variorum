/**
 * Target selection for "restore last valid revision" (DESIGN.md
 * "Revision History & Restore"). Pure: takes the revision list and a
 * validates callback, knows nothing about extensions or the repository.
 */
import type { Artifact } from '@design/repository-api';

/** The newest artifact whose content validates, or null if none does. */
export async function findLastValid(
  artifacts: Artifact[],
  validates: (content: string) => Promise<boolean>,
): Promise<Artifact | null> {
  // Newest first, one probe at a time: validates parses the content, so
  // revisions past the answer are never probed.
  for (const artifact of [...artifacts].reverse()) {
    if (await validates(artifact.content)) return artifact;
  }
  return null;
}
