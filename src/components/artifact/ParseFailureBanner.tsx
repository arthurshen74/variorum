/**
 * The parse-failure banner (DESIGN.md "Revision History & Restore"):
 * shown by the pane when the latest SAVED revision fails the applicable
 * extension's validates hook — never for a broken draft. Offers a
 * one-click restore of the newest revision that parses.
 */
import { useEffect, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { findLastValid } from '@/domain/revision-validity';
import { repository } from '@/persistence/repository';
import type { Artifact, Unit } from '@design/repository-api';

interface ParseFailureBannerProps {
  unit: Unit;
  validates: (content: string) => Promise<boolean>;
}

// Nothing renders until the probe answers, so a valid artifact never
// flashes a banner on its way to being cleared.
type Probe =
  | { state: 'checking' }
  | { state: 'ok' }
  | { state: 'broken'; target: Artifact | null };

export function ParseFailureBanner({
  unit,
  validates,
}: ParseFailureBannerProps): ReactElement | null {
  const latest = unit.artifacts.at(-1);
  const [probe, setProbe] = useState<Probe>({ state: 'checking' });

  useEffect(() => {
    if (latest === undefined) {
      setProbe({ state: 'ok' });
      return;
    }
    let current = true;
    setProbe({ state: 'checking' });
    // One pass answers both questions: the newest valid revision IS the
    // latest exactly when the latest parses, and is otherwise the restore
    // target.
    void findLastValid(unit.artifacts, validates).then((lastValid) => {
      if (!current) return;
      setProbe(
        lastValid?.version === latest.version
          ? { state: 'ok' }
          : { state: 'broken', target: lastValid },
      );
    });
    return () => {
      current = false;
    };
  }, [unit.artifacts, latest, validates]);

  if (probe.state !== 'broken') return null;
  const target = probe.target;

  return (
    <div className="flex shrink-0 items-center gap-3 border-b bg-destructive/10 px-3 py-2">
      <span className="text-xs">
        The latest revision doesn't parse.
        {target === null ? ' No earlier revision parses either.' : null}
      </span>
      {target !== null ? (
        <Button
          className="ml-auto"
          variant="outline"
          size="sm"
          onClick={() => {
            void repository.saveManualEdit(unit.id, target.content);
          }}
        >
          Restore last valid revision
        </Button>
      ) : null}
    </div>
  );
}
