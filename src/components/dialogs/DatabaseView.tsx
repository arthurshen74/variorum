/**
 * The Database view of the Configurations dialog (DESIGN.md "Management
 * UI"): export, import (merge), and replace-from-backup as three separate
 * actions. Outcomes render inline; a successful replace reports upward so
 * the shell can deselect the active unit.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DatabaseDump } from '@/domain/types';
import { repository } from '@/persistence/repository';
import {
  pickReplaceFile,
  runExport,
  runImport,
  runReplace,
  type ActionOutcome,
  type DatabasePorts,
} from './database-actions';
import { deliverBackup, deliverExport, readDumpFile } from './file-io';

export interface DatabaseViewProps {
  onReplaced: () => void;
  onBack: () => void;
}

const PORTS: DatabasePorts = {
  exportDatabase: async (deliver) => {
    await repository.exportDatabase(deliver);
  },
  importDatabase: (dump) => repository.importDatabase(dump),
  replaceDatabase: (dump, deliver) => repository.replaceDatabase(dump, deliver),
  deliverExport,
  deliverBackup,
  readDumpFile,
};

const CANCELLED_MESSAGE = 'Cancelled — nothing changed.';

const STATUS_CLASS = 'grid gap-0.5 rounded-md border px-2 py-1.5 text-xs';
const ALERT_CLASS =
  'rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs text-destructive';
const CONFIRM_CLASS =
  'grid gap-1 rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1.5 text-xs';

export default function DatabaseView({
  onReplaced,
  onBack,
}: DatabaseViewProps) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);
  const [pending, setPending] = useState<DatabaseDump | null>(null);

  /** One action at a time: every button disables for the duration. */
  async function run(action: () => Promise<ActionOutcome>) {
    setBusy(true);
    setOutcome(await action());
    setBusy(false);
  }

  async function startReplace() {
    setBusy(true);
    const picked = await pickReplaceFile(PORTS);
    if (picked.kind === 'picked') {
      // A leftover outcome from an earlier action would read as this
      // replace's result, so the confirmation stands alone.
      setOutcome(null);
      setPending(picked.dump);
    } else {
      setOutcome(picked);
    }
    setBusy(false);
  }

  async function confirmReplace(dump: DatabaseDump) {
    setBusy(true);
    const result = await runReplace(PORTS, dump);
    setPending(null);
    setOutcome(result);
    setBusy(false);
    if (result.kind === 'success') onReplaced();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Database</DialogTitle>
        <DialogDescription>
          Whole-database actions. Import merges into what is already here;
          Replace swaps everything for the chosen file.
        </DialogDescription>
      </DialogHeader>

      {outcome?.kind === 'error' && (
        <p role="alert" className={ALERT_CLASS}>
          {outcome.message}
        </p>
      )}
      {(outcome?.kind === 'success' || outcome?.kind === 'cancelled') && (
        <div role="status" className={STATUS_CLASS}>
          {outcome.kind === 'cancelled' ?
            <p>{CANCELLED_MESSAGE}</p>
          : outcome.lines.map((line) => <p key={line}>{line}</p>)}
        </div>
      )}

      {/* The confirmation replaces the actions: approving a wipe is not a
          moment to offer other doors. */}
      {pending === null ?
        <div className="grid gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              void run(() => runExport(PORTS));
            }}
          >
            Export database
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              void run(() => runImport(PORTS));
            }}
          >
            Import (merge)
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              void startReplace();
            }}
          >
            Replace from backup
          </Button>
        </div>
      : <div className={CONFIRM_CLASS}>
          <p>
            The entire database will be replaced by the chosen file — every
            unit and configuration now in it goes away.
          </p>
          <p>A pre-replace backup downloads before anything is deleted.</p>
        </div>
      }

      <DialogFooter>
        {pending === null ?
          <Button variant="outline" disabled={busy} onClick={onBack}>
            Back
          </Button>
        : <>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setPending(null);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                void confirmReplace(pending);
              }}
            >
              Confirm replace
            </Button>
          </>
        }
      </DialogFooter>
    </>
  );
}
