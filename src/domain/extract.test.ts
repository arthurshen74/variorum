/**
 * [G1] partitionResponse — the transcript-side split around the lifted
 * fence (DESIGN.md "Chat"). Its artifact must agree with extractArtifact
 * on every input; the tests also lock extractArtifact's semantics (last
 * fence wins, no match → null) through that agreement.
 */
import { describe, expect, it } from 'vitest';
import { extractArtifact, partitionResponse } from './extract';

describe('[G1] partitionResponse', () => {
  it('no matching fence: whole text is before, artifact null, after empty', () => {
    const text = 'Just prose, no code at all.';
    expect(partitionResponse(text, 'yaml')).toEqual({
      before: text,
      artifact: null,
      after: '',
    });
  });

  it('single matching fence splits before / artifact / after', () => {
    const text = 'Here you go:\n\n```yaml\na: 1\n```\n\nDone.';
    expect(partitionResponse(text, 'yaml')).toEqual({
      before: 'Here you go:\n\n',
      artifact: 'a: 1\n',
      after: '\n\nDone.',
    });
  });

  it('last matching fence wins; the earlier stays intact in before', () => {
    const text =
      'First try:\n```yaml\na: 1\n```\nBetter:\n```yaml\nb: 2\n```\nEnd.';
    const result = partitionResponse(text, 'yaml');
    expect(result.artifact).toBe('b: 2\n');
    expect(result.before).toBe('First try:\n```yaml\na: 1\n```\nBetter:\n');
    expect(result.after).toBe('\nEnd.');
  });

  it('non-matching-language fences stay in the prose untouched', () => {
    const text = '```bash\nrun.sh\n```\n\n```yaml\na: 1\n```';
    const result = partitionResponse(text, 'yaml');
    expect(result.artifact).toBe('a: 1\n');
    expect(result.before).toBe('```bash\nrun.sh\n```\n\n');
    expect(result.after).toBe('');
  });

  it('fence at the very start and end yields empty before and after', () => {
    expect(partitionResponse('```yaml\na: 1\n```', 'yaml')).toEqual({
      before: '',
      artifact: 'a: 1\n',
      after: '',
    });
  });

  it('an unterminated fence is prose, not an artifact', () => {
    const text = 'Start:\n```yaml\na: 1';
    expect(partitionResponse(text, 'yaml')).toEqual({
      before: text,
      artifact: null,
      after: '',
    });
  });

  it('an artifactType with regex metacharacters matches literally', () => {
    expect(partitionResponse('```c++\nint x;\n```', 'c++').artifact).toBe(
      'int x;\n',
    );
    expect(partitionResponse('```cxx\nint x;\n```', 'c++').artifact).toBeNull();
  });

  it('agrees with extractArtifact on every fixture', () => {
    const fixtures: [string, string][] = [
      ['prose only', 'yaml'],
      ['Here:\n```yaml\na: 1\n```\nBye.', 'yaml'],
      ['```yaml\na: 1\n```\n```yaml\nb: 2\n```', 'yaml'],
      ['```bash\nx\n```', 'yaml'],
      ['```yaml\nunterminated', 'yaml'],
      ['```c++\nint x;\n```', 'c++'],
      ['', 'yaml'],
    ];
    for (const [text, type] of fixtures) {
      expect(partitionResponse(text, type).artifact).toBe(
        extractArtifact(text, type),
      );
    }
  });
});

describe('[G1] marked fence preference', () => {
  it('a marked fence beats a later unmarked one — the schema-then-example response', () => {
    const text =
      'Schema:\n```yaml artifact\nclasses: {}\n```\nExample:\n```yaml\nname: Ada\n```\n';
    expect(extractArtifact(text, 'yaml')).toBe('classes: {}\n');
  });

  it('among several marked fences the last wins', () => {
    const text =
      '```yaml artifact\na: 1\n```\n```yaml artifact\nb: 2\n```\n```yaml\nc: 3\n```';
    expect(extractArtifact(text, 'yaml')).toBe('b: 2\n');
  });

  it('the marker is the whole word artifact — artifactx does not count', () => {
    const text =
      '```yaml artifact\na: 1\n```\n```yaml artifactx\nb: 2\n```\n```yaml\nc: 3\n```';
    expect(extractArtifact(text, 'yaml')).toBe('a: 1\n');
  });

  it('a marked fence of another language neither wins nor disturbs the preference', () => {
    const text =
      '```yaml artifact\na: 1\n```\n```json artifact\n{"b": 2}\n```\n```yaml\nc: 3\n```';
    expect(extractArtifact(text, 'yaml')).toBe('a: 1\n');
  });

  it('partition splits around the marked fence; the later unmarked fence stays in after', () => {
    const text =
      'Schema:\n```yaml artifact\nclasses: {}\n```\nExample:\n```yaml\nname: Ada\n```\n';
    const result = partitionResponse(text, 'yaml');
    expect(result.before).toBe('Schema:\n');
    expect(result.artifact).toBe('classes: {}\n');
    expect(result.after).toBe('\nExample:\n```yaml\nname: Ada\n```\n');
  });
});
