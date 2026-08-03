/**
 * [G3] The SDK boundary mappings (DESIGN.md "Chat"): seeding useChat
 * from persisted messages, stripping reasoning from request context,
 * and folding a finished UIMessage back into an AssistantCompletion.
 */
import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import {
  completionFromUIMessage,
  toModelMessages,
  toUIMessages,
} from './mapping';
import type { Message } from '@/domain/types';

const PERSISTED: Message[] = [
  {
    role: 'user',
    configVersion: 1,
    sentAt: '2026-08-03T10:00:00.000Z',
    content: 'hi',
  },
  {
    role: 'assistant',
    configVersion: 1,
    sentAt: '2026-08-03T10:00:01.000Z',
    receivedFinishedAt: '2026-08-03T10:00:05.000Z',
    reasoning: 'let me think',
    content: 'hello',
  },
];

describe('[G3] mapping', () => {
  it('toUIMessages maps roles and parts; persisted reasoning becomes a reasoning part', () => {
    const ui = toUIMessages(PERSISTED);
    expect(ui.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(new Set(ui.map((m) => m.id)).size).toBe(2);

    expect(ui[0]?.parts).toEqual([{ type: 'text', text: 'hi' }]);
    const assistantParts = ui[1]?.parts ?? [];
    expect(
      assistantParts.find((p) => p.type === 'reasoning'),
    ).toMatchObject({ text: 'let me think' });
    expect(assistantParts.find((p) => p.type === 'text')).toMatchObject({
      text: 'hello',
    });
  });

  it('toModelMessages strips all reasoning; roles and text survive', () => {
    const ui: UIMessage[] = [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      {
        id: 'm2',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'NEVER-RESENT-CHAIN' },
          { type: 'text', text: 'hello' },
        ],
      },
    ];
    const model = toModelMessages(ui);
    expect(JSON.stringify(model)).not.toContain('NEVER-RESENT-CHAIN');
    expect(model.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(JSON.stringify(model)).toContain('hello');
  });

  it('completionFromUIMessage concatenates text and reasoning parts; omits absent reasoning', () => {
    const finished: UIMessage = {
      id: 'm3',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'step one, ' },
        { type: 'reasoning', text: 'step two' },
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world' },
      ],
    };
    expect(
      completionFromUIMessage(
        finished,
        '2026-08-03T10:00:00.000Z',
        '2026-08-03T10:00:05.000Z',
      ),
    ).toEqual({
      content: 'Hello world',
      reasoning: 'step one, step two',
      sentAt: '2026-08-03T10:00:00.000Z',
      receivedFinishedAt: '2026-08-03T10:00:05.000Z',
    });

    const noReasoning: UIMessage = {
      id: 'm4',
      role: 'assistant',
      parts: [{ type: 'text', text: 'plain' }],
    };
    const completion = completionFromUIMessage(
      noReasoning,
      '2026-08-03T10:00:00.000Z',
      '2026-08-03T10:00:05.000Z',
    );
    expect(completion.content).toBe('plain');
    expect('reasoning' in completion).toBe(false);
  });
});
