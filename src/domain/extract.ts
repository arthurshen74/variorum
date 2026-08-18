/**
 * The fence extractor (DESIGN.md "Configurations"): lifts the artifact out
 * of a completed LLM response. The configuration's artifactType is the
 * fence language — a `linkml` configuration with artifactType "yaml" means
 * we lift ```yaml fences.
 *
 * Among matching fences, one MARKED as the artifact wins: a fence whose
 * info string carries the marker word after the language. Among marked
 * fences the last wins; when none is marked the last matching fence wins.
 * Returns null when no matching fence exists (the response didn't change
 * the artifact — no revision is captured; see DESIGN.md "Revision history").
 */

/** The word a fence's info string carries to declare itself the artifact. */
export const ARTIFACT_FENCE_MARKER = 'artifact';

const MARKED_INFO = new RegExp(
  `(?:^|\\s)${ARTIFACT_FENCE_MARKER}(?:\\s|$)`,
);

export function extractArtifact(
  responseText: string,
  artifactType: string,
): string | null {
  return partitionResponse(responseText, artifactType).artifact;
}

/**
 * The transcript-side split (DESIGN.md "Chat"): prose before the lifted
 * fence, the artifact itself, prose after — the chip renders in between.
 * Only the lifted fence is removed from the prose; every other matching
 * fence stays in `before` or `after` as an ordinary code block.
 * `artifact` always equals extractArtifact for the same input; when it is
 * null, `before` is the whole text and `after` is empty.
 */
export interface PartitionedResponse {
  before: string;
  artifact: string | null;
  after: string;
}

export function partitionResponse(
  responseText: string,
  artifactType: string,
): PartitionedResponse {
  const escaped = artifactType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fence = new RegExp(
    '```' + escaped + '([^\\n]*)\\n([\\s\\S]*?)```',
    'g',
  );
  let last: RegExpExecArray | null = null;
  let lastMarked: RegExpExecArray | null = null;
  for (const match of responseText.matchAll(fence)) {
    last = match;
    if (MARKED_INFO.test(match[1] ?? '')) {
      lastMarked = match;
    }
  }
  const lifted = lastMarked ?? last;
  if (lifted === null) {
    return { before: responseText, artifact: null, after: '' };
  }
  return {
    before: responseText.slice(0, lifted.index),
    artifact: lifted[2] ?? null,
    after: responseText.slice(lifted.index + lifted[0].length),
  };
}
