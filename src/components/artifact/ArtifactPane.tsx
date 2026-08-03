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

interface ArtifactPaneProps {
  unitId: string | null;
}

// The buffer and the revision it was seeded from. `base` is what makes a
// landing revision detectable: the latest content moving away from it is a
// new revision, and whether `working` still matches it decides between
// following silently and prompting.
interface Buffer {
  unitId: string | null;
  base: string;
  working: string;
}

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
  const seeded: Buffer = {
    unitId,
    base: latestContent,
    working: latestContent,
  };
  const [buffer, setBuffer] = useState<Buffer>(seeded);
  const [collision, setCollision] = useState(false);

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
  const ExtensionComponent = activeTab?.component ?? null;

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
          {dirty ? (
            <span className="text-xs text-muted-foreground">unsaved</span>
          ) : null}
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
                setBuffer((current) => ({ ...current, working: next }));
              }}
              readOnly={false}
              context={context}
            />
          </Suspense>
        ) : null}
      </div>
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
                setBuffer((current) => ({ ...current, base: latestContent }));
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
