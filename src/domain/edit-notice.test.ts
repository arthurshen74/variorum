/**
 * [G1] Edit-notice decisions (DESIGN.md "Manual edits enter the
 * conversation"): when the next send must announce a manual revision,
 * and the exact notice body — prefix line plus artifact-marked fence.
 */
import { describe, expect, it } from 'vitest';
import { editNoticeContent, pendingEditNotice } from './edit-notice';
import { extractArtifact } from './extract';
import type { Artifact, Message, Unit } from './types';

const T = '2026-08-03T10:00:00.000Z';

function revision(over: Partial<Artifact>): Artifact {
  return { version: 1, savedAt: T, source: 'manual', content: 'x: 1\n', ...over };
}

function chat(content: string): Message {
  return { role: 'user', configVersion: 1, sentAt: T, content };
}

function notice(artifactVersion: number): Message {
  return {
    role: 'user',
    configVersion: 1,
    sentAt: T,
    kind: 'editNotice',
    artifactVersion,
    content: 'notice body',
  };
}

function unit(messages: Message[], artifacts: Artifact[]): Unit {
  return {
    id: 'u1',
    conversationName: 'thread',
    configName: 'linkml',
    createdAt: T,
    archived: false,
    messages,
    artifacts,
  };
}

describe('[G1] pendingEditNotice', () => {
  it('latest revision manual with no notice: returns that revision', () => {
    const manual = revision({ version: 2, content: 'y: 2\n' });
    const subject = unit(
      [chat('make it')],
      [revision({ version: 1, source: 'llm', messageIndex: 0 }), manual],
    );
    expect(pendingEditNotice(subject)).toEqual(manual);
  });

  it('latest revision from the llm: null', () => {
    const subject = unit(
      [chat('make it')],
      [
        revision({ version: 1 }),
        revision({ version: 2, source: 'llm', messageIndex: 0, content: 'z\n' }),
      ],
    );
    expect(pendingEditNotice(subject)).toBeNull();
  });

  it('no revisions at all: null', () => {
    expect(pendingEditNotice(unit([chat('hi')], []))).toBeNull();
  });

  it('a notice already pointing at the latest manual revision: null', () => {
    const subject = unit(
      [notice(1), chat('continue')],
      [revision({ version: 1 })],
    );
    expect(pendingEditNotice(subject)).toBeNull();
  });

  it('a notice pointing at an older revision: the newer manual revision is returned', () => {
    const newer = revision({ version: 2, content: 'y: 2\n' });
    const subject = unit(
      [notice(1), chat('continue')],
      [revision({ version: 1 }), newer],
    );
    expect(pendingEditNotice(subject)).toEqual(newer);
  });
});

describe('[G1] editNoticeContent', () => {
  it('produces the fixed template: prefix line, blank line, marked fence', () => {
    expect(editNoticeContent('yaml', 'a: 1\n')).toBe(
      'The user manually edited the artifact. The current artifact is:\n\n' +
        '```yaml artifact\na: 1\n```\n',
    );
  });

  it('adds the missing trailing newline before the closing fence', () => {
    expect(editNoticeContent('yaml', 'a: 1')).toBe(
      'The user manually edited the artifact. The current artifact is:\n\n' +
        '```yaml artifact\na: 1\n```\n',
    );
  });

  it('its fence carries the marker the extractor prefers', () => {
    const body = editNoticeContent('yaml', 'a: 1\n');
    expect(extractArtifact(body, 'yaml')).toBe('a: 1\n');
  });
});
