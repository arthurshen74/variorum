/**
 * Right chat pane. The conversation UI (AI Elements: messages, reasoning,
 * loaders, tool confirmations) lands with the chat implementation — run
 * `npx ai-elements@latest` to vendor the components, then build here.
 */
interface ChatPaneProps {
  unitId: string | null;
}

export default function ChatPane({ unitId }: ChatPaneProps) {
  return (
    <aside className="flex w-96 shrink-0 flex-col border-l">
      <div className="flex h-11 items-center border-b px-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Chat
        </span>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <p className="text-center text-xs text-muted-foreground">
          {unitId === null
            ? 'Select a unit to start a conversation.'
            : 'Chat arrives with the AI Elements integration.'}
        </p>
      </div>
      <div className="border-t p-3">
        <textarea
          disabled
          rows={2}
          placeholder="Message (coming soon)"
          className="w-full resize-none rounded-md border bg-muted/30 px-2 py-1.5 text-sm"
        />
      </div>
    </aside>
  );
}
