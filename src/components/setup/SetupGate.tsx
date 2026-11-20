/**
 * The setup gate (DESIGN.md "First-Run Setup", "The setup gate" and
 * "Restore from backup, on the gate"): a dialog over the shell that
 * cannot be dismissed while the Models/Providers document holds no
 * endpoint or no model. It walks the tree's own Add Endpoint and Add
 * Model forms, and offers the Database view's replace flow first. The
 * document is read once, at mount, and held in component state — device
 * state stays out of the store.
 */
import { useState } from 'react';
import {
  type DatabasePorts,
  pickReplaceFile,
  runReplace,
} from '@/components/dialogs/database-actions';
import EndpointForm from '@/components/dialogs/EndpointForm';
import {
  deliverBackup,
  deliverExport,
  readDumpFile,
} from '@/components/dialogs/file-io';
import ModelForm from '@/components/dialogs/ModelForm';
import { blankModelDraft } from '@/components/dialogs/provider-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DatabaseDump } from '@/domain/types';
import {
  type ProviderDocument,
  ProviderDocumentError,
  readProviderDocument,
  writeProviderDocument,
} from '@/llm/provider-document';
import {
  addEndpoint,
  addModel,
  type MutationResult,
} from '@/llm/provider-mutations';
import { repository } from '@/persistence/repository';
import { setupEndpointDraft, setupStep } from './setup-step';

const PORTS: DatabasePorts = {
  exportDatabase: async (deliver) => {
    await repository.exportDatabase(deliver);
  },
  importDatabase: (dump) => repository.importDatabase(dump),
  replaceDatabase: (dump, deliver) => repository.replaceDatabase(dump, deliver),
  ensureBuiltInConfiguration: () => repository.ensureBuiltInConfiguration(),
  deliverExport,
  deliverBackup,
  readDumpFile,
};

const ALERT_CLASS =
  'rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs text-destructive';
const STATUS_CLASS = 'grid gap-0.5 rounded-md border px-2 py-1.5 text-xs';
const CONFIRM_CLASS =
  'grid gap-1 rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1.5 text-xs';

/**
 * The document, or null when it is malformed: the gate cannot tell which
 * step is missing then, and the tree and the error row name the key.
 */
function loadDocument(): ProviderDocument | null {
  try {
    return readProviderDocument();
  } catch (error) {
    if (error instanceof ProviderDocumentError) return null;
    throw error;
  }
}

export default function SetupGate() {
  const [providers, setProviders] = useState(loadDocument);
  const [alert, setAlert] = useState<string | null>(null);
  const [status, setStatus] = useState<string[] | null>(null);
  const [pending, setPending] = useState<DatabaseDump | null>(null);
  const [busy, setBusy] = useState(false);

  const step = setupStep(providers);
  if (providers === null || step === null) return null;
  const firstEndpoint = providers.endpoints[0];

  function commit(result: MutationResult) {
    if (!result.ok) {
      setAlert(result.message);
      return;
    }
    writeProviderDocument(result.document);
    setProviders(result.document);
    setAlert(null);
    setStatus(null);
  }

  async function startRestore() {
    setBusy(true);
    const picked = await pickReplaceFile(PORTS);
    if (picked.kind === 'picked') {
      setAlert(null);
      setStatus(null);
      setPending(picked.dump);
    } else if (picked.kind === 'error') {
      setAlert(picked.message);
    }
    setBusy(false);
  }

  async function confirmRestore(dump: DatabaseDump) {
    setBusy(true);
    const result = await runReplace(PORTS, dump);
    setPending(null);
    if (result.kind === 'success') setStatus(result.lines);
    if (result.kind === 'error') setAlert(result.message);
    setBusy(false);
  }

  return (
    // No onOpenChange: Escape and outside clicks ask to close and nothing
    // answers. The gate closes when the document satisfies setupStep.
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>First-run setup</DialogTitle>
          <DialogDescription>
            Tell Variorum where this machine finds a model: an endpoint, then a
            model it serves. Moving from another machine? Restore your backup
            first.
          </DialogDescription>
        </DialogHeader>

        {alert !== null && (
          <p
            role="alert"
            className={ALERT_CLASS}
          >
            {alert}
          </p>
        )}
        {status !== null && (
          <div
            role="status"
            className={STATUS_CLASS}
          >
            {status.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}

        {/* The confirmation replaces the form, as in the Database view.
            The model step implies an endpoint; the undefined test only
            narrows the type. */}
        {pending !== null ?
          <div className={CONFIRM_CLASS}>
            <p>
              The entire database will be replaced by the chosen file — every
              unit and configuration now in it goes away.
            </p>
            <p>A pre-replace backup downloads before anything is deleted.</p>
          </div>
        : step === 'endpoint' || firstEndpoint === undefined ?
          <EndpointForm
            title="Add endpoint"
            initial={setupEndpointDraft()}
            onSubmit={(input) =>
              commit(addEndpoint(providers, input, crypto.randomUUID()))
            }
            onRefuse={setAlert}
          />
        : <ModelForm
            title="Add model"
            initial={blankModelDraft()}
            adding
            endpoints={providers.endpoints}
            initialEndpointId={firstEndpoint.id}
            onSubmit={(input, endpointId) =>
              commit(addModel(providers, endpointId, input))
            }
            onRefuse={setAlert}
          />
        }

        <DialogFooter>
          {pending === null ?
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                void startRestore();
              }}
            >
              Restore from backup
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
                  void confirmRestore(pending);
                }}
              >
                Confirm replace
              </Button>
            </>
          }
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
