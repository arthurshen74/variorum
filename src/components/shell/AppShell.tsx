/**
 * The three-pane shell (DESIGN.md "UI"): collapsible sidebar · artifact
 * pane · collapsible chat pane. Pane visibility, the active unit, and
 * which dialog is open are app-level UI state and live here — never in
 * the domain store.
 */
import { useState } from 'react';
import { selectUnit } from '@/state/selectors';
import { useVariorum } from '@/state/store';
import ArtifactPane from '@/components/artifact/ArtifactPane';
import ArchiveConfirm from '@/components/dialogs/ArchiveConfirm';
import ConfigurationsDialog from '@/components/dialogs/ConfigurationsDialog';
import NewUnitDialog from '@/components/dialogs/NewUnitDialog';
import type { Unit } from '@/domain/types';
import ChatPane from './ChatPane';
import Sidebar from './Sidebar';

type OpenDialog = 'configurations' | 'newUnit' | null;

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [archiveTarget, setArchiveTarget] = useState<Unit | null>(null);
  // inside AppShell, after the useState calls:
  const activeUnitName = useVariorum((s) =>
    activeUnitId === null ? undefined : (
      selectUnit(activeUnitId)(s)?.conversationName
    ),
  );
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {sidebarOpen ?
        <Sidebar
          activeUnitId={activeUnitId}
          onSelectUnit={setActiveUnitId}
          onOpenConfigurations={() => setDialog('configurations')}
          onNewUnit={() => setDialog('newUnit')}
          onArchiveUnit={setArchiveTarget}
        />
      : null}
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
          <h1 className="text-sm font-semibold tracking-tight">
            {activeUnitName !== undefined ?
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                {activeUnitName}
              </span>
            : 'Variorum'}
          </h1>
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
      {chatOpen ?
        <ChatPane unitId={activeUnitId} />
      : null}
      <ConfigurationsDialog
        open={dialog === 'configurations'}
        onOpenChange={(open) => setDialog(open ? 'configurations' : null)}
      />
      <NewUnitDialog
        open={dialog === 'newUnit'}
        onOpenChange={(open) => setDialog(open ? 'newUnit' : null)}
        onCreated={setActiveUnitId}
      />
      <ArchiveConfirm
        unit={archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onArchived={(unitId) => {
          setArchiveTarget(null);
          setActiveUnitId((current) => (current === unitId ? null : current));
        }}
      />
    </div>
  );
}
