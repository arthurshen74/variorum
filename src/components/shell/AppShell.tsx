/**
 * The three-pane shell (DESIGN.md "UI"): collapsible sidebar · artifact
 * pane · collapsible chat pane. Pane visibility and the active unit are
 * app-level UI state and live here — never in the domain store.
 */
import { useState } from 'react';
import Sidebar from './Sidebar';
import ChatPane from './ChatPane';
import ArtifactPane from '@/components/artifact/ArtifactPane';

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {sidebarOpen ? (
        <Sidebar activeUnitId={activeUnitId} onSelectUnit={setActiveUnitId} />
      ) : null}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            className="rounded-md px-2 py-1 text-sm hover:bg-accent"
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
          <h1 className="text-sm font-semibold tracking-tight">Variorum</h1>
          <button
            type="button"
            onClick={() => setChatOpen((open) => !open)}
            className="ml-auto rounded-md px-2 py-1 text-sm hover:bg-accent"
          >
            {chatOpen ? 'Hide chat' : 'Show chat'}
          </button>
        </header>
        <ArtifactPane unitId={activeUnitId} />
      </main>
      {chatOpen ? <ChatPane unitId={activeUnitId} /> : null}
    </div>
  );
}
