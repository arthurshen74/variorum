/**
 * The artifact pane (DESIGN.md "UI" + "Extensions"): owns the tab strip,
 * the single working-copy buffer, and the Save button. Extensions edit
 * the buffer through onChange; Save is the ONE manual-save path no matter
 * which tab did the editing.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useVariorum } from '@/state/store';
import { selectConfiguration, selectUnit } from '@/state/selectors';
import { applicableExtensions } from '@/extensions/registry';
import type { ExtensionContext } from '@/extensions/extension';
import { repository } from '@/persistence/repository';

interface ArtifactPaneProps {
  unitId: string | null;
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
  const [workingCopy, setWorkingCopy] = useState(latestContent);

  // New unit selected → new working copy. (An LLM revision landing while
  // dirty gets a keep-or-take prompt when chat lands; see DESIGN.md.)
  useEffect(() => {
    setWorkingCopy(latestContent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

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

  const dirty = workingCopy !== latestContent;
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
              void repository.saveManualEdit(unit.id, workingCopy);
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
              content={workingCopy}
              onChange={setWorkingCopy}
              readOnly={false}
              context={context}
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
