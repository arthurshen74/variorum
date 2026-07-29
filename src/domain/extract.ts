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
