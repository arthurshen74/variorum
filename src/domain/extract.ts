/**
 * The fence extractor (DESIGN.md "Configurations"): lifts the artifact out
 * of a completed LLM response. The configuration's artifactType is the
 * fence language — a `linkml` configuration with artifactType "yaml" means
 * we lift ```yaml fences.
 *
 * If the response contains several matching fences, the LAST one wins: a
 * response that shows intermediate attempts ends with the final artifact.
 * Returns null when no matching fence exists (the response didn't change
 * the artifact — no revision is captured; see DESIGN.md "Revision history").
 */
export function extractArtifact(
  responseText: string,
  artifactType: string,
): string | null {
  const escaped = artifactType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fence = new RegExp('```' + escaped + '[^\\n]*\\n([\\s\\S]*?)```', 'g');
  let last: string | null = null;
  for (const match of responseText.matchAll(fence)) {
    last = match[1] ?? null;
  }
  return last;
}

/**
 * The transcript-side split (DESIGN.md "Chat"): prose before the lifted
 * fence, the artifact itself, prose after — the chip renders in between.
 * Only the LAST matching fence (the lifted one) is removed from the
 * prose; earlier matching fences stay in `before` as ordinary code
 * blocks. `artifact` always equals extractArtifact for the same input;
 * when it is null, `before` is the whole text and `after` is empty.
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
  void responseText;
  void artifactType;
  throw new Error('not implemented: partitionResponse');
}
