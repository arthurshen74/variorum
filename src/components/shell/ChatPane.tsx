/**
 * Right chat pane (DESIGN.md "Chat"): AI Elements over the AI SDK's
 * useChat. Owns the exchange — appendUserMessage before the network,
 * post-hoc extraction and ONE completeExchange when a response finishes,
 * and discard-everything on cancel. The useChat instance is keyed by unit,
 * so switching units tears it down and aborts whatever was in flight.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Loader } from '@/components/ai-elements/loader';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { extractArtifact } from '@/domain/extract';
import type { Unit } from '@/domain/types';
import { completionFromUIMessage, toUIMessages } from '@/llm/mapping';
import { VariorumChatTransport } from '@/llm/chat-transport';
import { repository } from '@/persistence/repository';
import { selectConfiguration, selectUnit } from '@/state/selectors';
import { useVariorum } from '@/state/store';

interface ChatPaneProps {
  unitId: string | null;
}

export default function ChatPane({ unitId }: ChatPaneProps) {
  const unit = useVariorum(
    useMemo(
      () => (unitId === null ? () => undefined : selectUnit(unitId)),
      [unitId],
    ),
  );
  const configuration = useVariorum(
    useMemo(
      () =>
        unit === undefined
          ? () => undefined
          : selectConfiguration(unit.configName),
      [unit],
    ),
  );

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l">
      <div className="flex h-11 shrink-0 items-center border-b px-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Chat
        </span>
      </div>
      {unit === undefined ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <p className="text-center text-xs text-muted-foreground">
            Select a unit to start a conversation.
          </p>
        </div>
      ) : (
        <UnitChat
          key={unit.id}
          unit={unit}
          artifactType={configuration?.artifactType ?? 'text'}
        />
      )}
    </aside>
  );
}

interface UnitChatProps {
  unit: Unit;
  artifactType: string;
}

function UnitChat({ unit, artifactType }: UnitChatProps) {
  const transport = useMemo(
    () => new VariorumChatTransport(unit.id),
    [unit.id],
  );
  const sentAt = useRef('');

  const { messages, setMessages, sendMessage, regenerate, stop, status, error } =
    useChat({
      transport,
      messages: toUIMessages(unit.messages),
      onError: () => dropPendingAssistant(),
      onFinish: ({ message, isAbort, isDisconnect, isError }) => {
        // A cancelled or failed response is never extracted from and never
        // recorded — revisions come from completed responses only.
        if (isAbort || isDisconnect || isError) return;
        const completion = completionFromUIMessage(
          message,
          sentAt.current,
          new Date().toISOString(),
        );
        const artifact = extractArtifact(completion.content, artifactType);
        void repository.completeExchange(
          unit.id,
          completion,
          artifact ?? undefined,
        );
      },
    });

  // The partial leaves the display too, so the screen never disagrees with
  // the record.
  function dropPendingAssistant() {
    setMessages((current) =>
      current.at(-1)?.role === 'assistant' ? current.slice(0, -1) : current,
    );
  }

  // Switching units unmounts this instance; the stream in flight is a
  // cancel with the same discard semantics.
  useEffect(() => () => void stop(), [stop]);

  const isGenerating = status === 'submitted' || status === 'streaming';

  return (
    <>
      <Conversation>
        <ConversationContent>
          {messages.map((message, index) => {
            const persisted = unit.messages[index];
            const revision = unit.artifacts.find(
              (artifact) => artifact.messageIndex === index,
            );
            return (
              <ChatMessage
                key={message.id}
                message={message}
                versionTag={
                  message.role === 'assistant' && persisted !== undefined
                    ? `${unit.configName}.${persisted.configVersion}`
                    : ''
                }
                artifactType={artifactType}
                revisionVersion={revision?.version ?? null}
                editNoticeVersion={null}
                isStreaming={
                  status === 'streaming' && index === messages.length - 1
                }
              />
            );
          })}
          {status === 'submitted' ? (
            <div role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader />
              Waiting for the model
            </div>
          ) : null}
          {status === 'error' ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs"
            >
              <span className="text-destructive">
                {error?.message ?? 'The request failed.'}
              </span>
              <button
                type="button"
                onClick={() => {
                  sentAt.current = new Date().toISOString();
                  void regenerate();
                }}
                className="w-fit rounded-md border px-2 py-1 font-medium hover:bg-accent"
              >
                Retry
              </button>
            </div>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="shrink-0 border-t p-3">
        <PromptInput
          onSubmit={async ({ text }) => {
            if (text.trim() === '') return;
            // Durable before any network is touched.
            await repository.appendUserMessage(unit.id, text);
            sentAt.current = new Date().toISOString();
            void sendMessage({ text });
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea aria-label="Message" placeholder="Message" />
          </PromptInputBody>
          <PromptInputFooter>
            <span />
            <PromptInputSubmit
              aria-label={isGenerating ? 'Stop' : 'Send'}
              status={status}
              onStop={() => {
                void stop();
                dropPendingAssistant();
              }}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  );
}
