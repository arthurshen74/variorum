/**
 * The artifact pane (DESIGN.md "UI" + "Extensions"): owns the tab strip,
 * the single working-copy buffer, and the Save button. Extensions edit
 * the buffer through onChange; Save is the ONE manual-save path no matter
 * which tab did the editing.
 *
 * The pane also follows revisions landing underneath it (DESIGN.md "Chat"
 * step 5): silently while the buffer is clean, and behind a keep-or-take
 * prompt while it is dirty. The revision itself is already captured by
 * the repository — the prompt only decides what the buffer shows.
 *
 * View (DESIGN.md "Revision History & Restore") seats an old revision in
 * that same buffer — no second buffer, no read-only mode — behind a
 * confirmation when it would destroy unsaved edits.
 */
import { Suspense, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useVariorum } from '@/state/store';
import { selectConfiguration, selectUnit } from '@/state/selectors';
import { applicableExtensions } from '@/extensions/registry';
import type { ExtensionContext } from '@/extensions/extension';
import { repository } from '@/persistence/repository';
import type { Artifact } from '@design/repository-api';
import { HistoryDialog } from './HistoryDialog';
import { ParseFailureBanner } from './ParseFailureBanner';
import { chipFor, viewGateFor, type ViewBuffer } from './view-buffer';

interface ArtifactPaneProps {
  unitId: string | null;
}

// `base` is what makes a landing revision detectable: the latest content
// moving away from it is a new revision, and whether `working` still
// matches it decides between following silently and prompting.

export default function ArtifactPane({ unitId }: ArtifactPaneProps) {
  const unit = useVariorum(
    useMemo(() => (unitId === null ? () => undefined : selectUnit(unitId)), [unitId]),
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

  const latestContent = unit?.artifacts.at(-1)?.content ?? '';
  const seeded: ViewBuffer = {
    unitId,
    base: latestContent,
    working: latestContent,
    viewedVersion: null,
  };
  const [buffer, setBuffer] = useState<ViewBuffer>(seeded);
  const [collision, setCollision] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingView, setPendingView] = useState<Artifact | null>(null);

  function seatView(artifact: Artifact) {
    setBuffer({
      unitId,
      base: latestContent,
      working: artifact.content,
      viewedVersion: artifact.version,
    });
  }

  if (buffer.unitId !== unitId) {
    // The buffer belongs to the unit, not to the pane.
    setBuffer(seeded);
    setCollision(false);
  } else if (buffer.base !== latestContent) {
    // A revision landed. An untouched buffer follows it; so does one whose
    // own manual save is the revision that just landed.
    // The `collision` guard is load-bearing: a render-phase update never
    // bails out on an equal value, so re-setting it would loop.
    if (buffer.working === buffer.base || buffer.working === latestContent) {
      setBuffer(seeded);
    } else if (!collision) {
      setCollision(true);
    }
  }

  const context: ExtensionContext = {
    artifactType: configuration?.artifactType ?? 'text',
    configName: unit?.configName ?? '',
    unitId: unitId ?? '',
  };
  const tabs = applicableExtensions(context);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const activeTab =
    tabs.find((t) => t.id === activeTabId) ?? tabs[0] ?? null;

  if (unit === undefined) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Select a unit from the sidebar — or create your first configuration.
        </p>
      </div>
    );
  }

  const dirty = buffer.working !== latestContent;
  const chip = chipFor(buffer, latestContent);
  const ExtensionComponent = activeTab?.component ?? null;
  // First applicable extension declaring the hook owns the verdict.
  const validates = tabs.find((t) => t.validates !== undefined)?.validates;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTabId(tab.id)}
            className={`rounded-md px-2 py-1 text-xs ${
              tab.id === activeTab?.id
                ? 'bg-accent font-medium'
                : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            {tab.title}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {chip !== null ? (
            <span className="text-xs text-muted-foreground">{chip}</span>
          ) : null}
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent"
          >
            History
          </button>
          <button
            type="button"
            disabled={!dirty}
            onClick={() => {
              void repository.saveManualEdit(unit.id, buffer.working);
            }}
            className="rounded-md border px-2 py-1 text-xs font-medium enabled:hover:bg-accent disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
      {validates !== undefined ? (
        <ParseFailureBanner unit={unit} validates={validates} />
      ) : null}
      <div className="min-h-0 flex-1">
        {ExtensionComponent !== null ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Loading editor…
              </div>
            }
          >
            <ExtensionComponent
              content={buffer.working}
              onChange={(next) => {
                // An editor re-syncing to content the host just seated
                // echoes it back; only a differing value is an edit, and
                // only an edit demotes the viewed designator.
                setBuffer((current) =>
                  next === current.working
                    ? current
                    : { ...current, working: next, viewedVersion: null },
                );
              }}
              readOnly={false}
              context={context}
            />
          </Suspense>
        ) : null}
      </div>
      <HistoryDialog
        unit={unit}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onView={(artifact) => {
          setHistoryOpen(false);
          if (viewGateFor(buffer, latestContent) === 'confirm') {
            setPendingView(artifact);
          } else {
            seatView(artifact);
          }
        }}
      />
      {pendingView !== null ? (
        <Dialog open onOpenChange={() => setPendingView(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Discard unsaved edits?</DialogTitle>
              <DialogDescription>
                Viewing revision v{pendingView.version} replaces the working
                copy with that revision's content. Edits you have not saved
                will be lost.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPendingView(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  seatView(pendingView);
                  setPendingView(null);
                }}
              >
                Discard and view
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      <Dialog open={collision}>
        {/* Undismissable: leaving without choosing would re-prompt on the
            next render, so the two buttons are the only ways out. */}
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>A new revision landed</DialogTitle>
            <DialogDescription>
              The response wrote revision {unit.artifacts.length} while this
              editor held edits of your own. The revision is kept either way —
              choose what the editor shows.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBuffer((current) => ({
                  ...current,
                  base: latestContent,
                  viewedVersion: null,
                }));
                setCollision(false);
              }}
            >
              Keep my edit
            </Button>
            <Button
              onClick={() => {
                setBuffer(seeded);
                setCollision(false);
              }}
            >
              Take new revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
