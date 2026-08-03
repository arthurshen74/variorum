/**
 * [G1] The parse gate learns Message.reasoning (DESIGN.md "Chat",
 * application-schema.yaml). The validator is hand-written on purpose —
 * these tests are what keep the new field from being silently stripped
 * or silently accepted with the wrong type.
 */
import { describe, expect, it } from 'vitest';
import { parseDump, serializeDump } from './dump-file';
import type { DatabaseDump } from './types';

function dumpJson(assistantMessage: Record<string, unknown>): string {
  return JSON.stringify({
    schemaVersion: 1,
    configurations: [{ name: 'linkml', artifactType: 'yaml', archived: false }],
    configurationVersions: [
      { name: 'linkml', version: 1, modelName: 'm', systemPrompt: 's' },
    ],
    units: [
      {
        id: 'u-1',
        conversationName: 'thread',
        configName: 'linkml',
        createdAt: '2026-08-01T00:00:00.000Z',
        archived: false,
        messages: [
          {
            role: 'user',
            configVersion: 1,
            sentAt: '2026-08-01T00:01:00.000Z',
            content: 'hi',
          },
          assistantMessage,
        ],
        artifacts: [],
      },
    ],
  });
}

const ASSISTANT = {
  role: 'assistant',
  configVersion: 1,
  sentAt: '2026-08-01T00:01:01.000Z',
  receivedFinishedAt: '2026-08-01T00:01:05.000Z',
  content: 'hello',
};

describe('[G1] parseDump and Message.reasoning', () => {
  it('accepts and preserves a string reasoning field', () => {
    const dump = parseDump(dumpJson({ ...ASSISTANT, reasoning: 'because' }));
    expect(dump.units[0]?.messages[1]?.reasoning).toBe('because');
  });

  it('rejects a non-string reasoning field, naming its path', () => {
    expect(() => parseDump(dumpJson({ ...ASSISTANT, reasoning: 42 }))).toThrow(
      /units\[0\]\.messages\[1\]\.reasoning/,
    );
  });

  it('reasoning is optional: dumps without it still parse, field absent', () => {
    const dump = parseDump(dumpJson(ASSISTANT));
    const message = dump.units[0]?.messages[1];
    expect(message).toBeDefined();
    expect(message !== undefined && 'reasoning' in message).toBe(false);
  });

  it('serialize → parse round-trips reasoning byte-for-byte', () => {
    const original: DatabaseDump = {
      schemaVersion: 1,
      configurations: [
        { name: 'linkml', artifactType: 'yaml', archived: false },
      ],
      configurationVersions: [
        { name: 'linkml', version: 1, modelName: 'm', systemPrompt: 's' },
      ],
      units: [
        {
          id: 'u-1',
          conversationName: 'thread',
          configName: 'linkml',
          createdAt: '2026-08-01T00:00:00.000Z',
          archived: false,
          messages: [
            {
              role: 'assistant',
              configVersion: 1,
              sentAt: '2026-08-01T00:01:01.000Z',
              receivedFinishedAt: '2026-08-01T00:01:05.000Z',
              reasoning: 'step one, step two',
              content: 'hello',
            },
          ],
          artifacts: [],
        },
      ],
    };
    expect(parseDump(serializeDump(original))).toEqual(original);
  });
});
