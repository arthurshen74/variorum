/**
 * The Models/Providers view of the Configurations dialog (DESIGN.md
 * "Management UI", "Models and Providers"): the device-local document
 * rendered as a tree of endpoints and their models, with add/edit/delete
 * for both, reassignment, the key-gap flag, and the "referenced, not
 * bound" hint list.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  readProviderDocument,
  writeProviderDocument,
  ProviderDocumentError,
  type Endpoint,
  type ModelRow,
  type ProviderDocument,
} from '@/llm/provider-document';
import {
  addEndpoint,
  addModel,
  deleteEndpoint,
  deleteModel,
  reassignModel,
  updateEndpoint,
  updateModel,
  type EndpointInput,
  type ModelInput,
  type MutationResult,
} from '@/llm/provider-mutations';
import { useVariorum } from '@/state/store';
import EndpointForm from './EndpointForm';
import ModelForm from './ModelForm';
import {
  blankEndpointDraft,
  blankModelDraft,
  endpointDraftFrom,
  endpointLabel,
  hasKeyGap,
  modelDraftFrom,
  referencedUnboundHandles,
  type EndpointDraft,
  type ModelDraft,
} from './provider-form';

export interface ProvidersViewProps {
  onBack: () => void;
}

/**
 * The document as loaded: a malformed one is shown, never overwritten —
 * the fix is the user clearing the key.
 */
type Stored =
  | { document: ProviderDocument; error: null }
  | { document: null; error: string };

function loadDocument(): Stored {
  try {
    return { document: readProviderDocument(), error: null };
  } catch (error) {
    if (error instanceof ProviderDocumentError) {
      return { document: null, error: error.message };
    }
    throw error;
  }
}

/** The tree, or one of the two forms in its place. */
type Mode =
  | { kind: 'tree' }
  | { kind: 'endpoint'; id: string | null; draft: EndpointDraft }
  | {
      kind: 'model';
      handle: string | null;
      endpointId: string;
      draft: ModelDraft;
    };

const UNBOUND_LIST_LABEL = 'Referenced by configurations, not bound';
const KEY_GAP_FLAG = 'No API key';

const LABEL_CLASS = 'text-xs font-medium';
const ALERT_CLASS =
  'rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs text-destructive';
const ROW_CLASS = 'flex items-center gap-2 rounded-md border px-2 py-1.5';

/** The wire name when it differs from the handle, and the key gap. */
function modelDetails(endpoint: Endpoint, model: ModelRow): string {
  return [
    model.modelName === model.handle ? null : model.modelName,
    hasKeyGap(endpoint, model) ? KEY_GAP_FLAG : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

export default function ProvidersView({ onBack }: ProvidersViewProps) {
  const configurations = useVariorum((s) => s.configurations);
  const versions = useVariorum((s) => s.configurationVersions);
  const [stored, setStored] = useState<Stored>(loadDocument);
  const [mode, setMode] = useState<Mode>({ kind: 'tree' });
  const [alert, setAlert] = useState<string | null>(null);

  const providers = stored.document;
  // The add-model form needs an endpoint to open against; with none in
  // the tree the hint list is a list only.
  const first = providers?.endpoints[0];
  const unbound =
    providers === null
      ? []
      : referencedUnboundHandles(configurations, versions, providers);

  function commit(result: MutationResult): boolean {
    if (!result.ok) {
      setAlert(result.message);
      return false;
    }
    writeProviderDocument(result.document);
    setStored({ document: result.document, error: null });
    setAlert(null);
    return true;
  }

  function showTree() {
    setMode({ kind: 'tree' });
    setAlert(null);
  }

  function saveEndpoint(
    document: ProviderDocument,
    input: EndpointInput,
    id: string | null,
  ) {
    const result =
      id === null
        ? addEndpoint(document, input, crypto.randomUUID())
        : updateEndpoint(document, id, input);
    if (commit(result)) showTree();
  }

  /**
   * A move is a second mutation on the result of the first: the row is
   * updated where it lives, then carried across.
   */
  function saveModel(
    document: ProviderDocument,
    input: ModelInput,
    endpointId: string,
    handle: string | null,
    fromEndpointId: string,
  ) {
    if (handle === null) {
      if (commit(addModel(document, endpointId, input))) showTree();
      return;
    }

    const updated = updateModel(document, handle, input);
    if (!updated.ok) {
      setAlert(updated.message);
      return;
    }
    const moved =
      endpointId === fromEndpointId
        ? updated
        : reassignModel(updated.document, input.handle, endpointId);
    if (commit(moved)) showTree();
  }

  function removeModel(document: ProviderDocument, handle: string) {
    commit({ ok: true, document: deleteModel(document, handle) });
  }

  function editEndpoint(endpoint: Endpoint) {
    setAlert(null);
    setMode({
      kind: 'endpoint',
      id: endpoint.id,
      draft: endpointDraftFrom(endpoint),
    });
  }

  function editModel(endpoint: Endpoint, model: ModelRow) {
    setAlert(null);
    setMode({
      kind: 'model',
      handle: model.handle,
      endpointId: endpoint.id,
      draft: modelDraftFrom(model),
    });
  }

  function addModelTo(endpointId: string, prefillName?: string) {
    setAlert(null);
    setMode({
      kind: 'model',
      handle: null,
      endpointId,
      draft: blankModelDraft(prefillName),
    });
  }

  // A refusal, or the parse failure that left no tree to refuse anything.
  const message = alert ?? stored.error;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Models/Providers</DialogTitle>
        <DialogDescription>
          Where this device finds the models configurations name. Device state —
          outside every configuration and every export.
        </DialogDescription>
      </DialogHeader>

      {message !== null && (
        <p role="alert" className={ALERT_CLASS}>
          {message}
        </p>
      )}

      {providers !== null && mode.kind === 'tree' && (
        <div className="grid gap-3">
          <div>
            <Button
              size="sm"
              onClick={() => {
                setAlert(null);
                setMode({
                  kind: 'endpoint',
                  id: null,
                  draft: blankEndpointDraft(),
                });
              }}
            >
              Add endpoint
            </Button>
          </div>

          {providers.endpoints.map((endpoint) => (
            <fieldset
              key={endpoint.id}
              className="grid gap-2 rounded-md border px-2 py-1.5"
            >
              <legend className="px-1 text-xs font-medium">
                {endpointLabel(endpoint)}
              </legend>
              <div className="flex gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => addModelTo(endpoint.id)}
                >
                  Add model
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => editEndpoint(endpoint)}
                >
                  Edit endpoint
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => commit(deleteEndpoint(providers, endpoint.id))}
                >
                  Delete endpoint
                </Button>
              </div>
              {endpoint.models.length > 0 && (
                <ul className="grid gap-1">
                  {/* The explicit space keeps the row's own text from
                      running into the button labels beside it. */}
                  {endpoint.models.map((model) => (
                    <li key={model.handle} className={ROW_CLASS}>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {model.handle}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {modelDetails(endpoint, model)}
                        </span>
                      </div>{' '}
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => editModel(endpoint, model)}
                      >
                        Edit model
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => removeModel(providers, model.handle)}
                      >
                        Delete model
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
          ))}

          {unbound.length > 0 && (
            <div className="grid gap-1">
              <span className={LABEL_CLASS}>{UNBOUND_LIST_LABEL}</span>
              <ul aria-label={UNBOUND_LIST_LABEL} className="grid gap-1">
                {unbound.map((handle) => (
                  <li key={handle} className={ROW_CLASS}>
                    <span className="min-w-0 flex-1 truncate">{handle}</span>{' '}
                    {first !== undefined && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => addModelTo(first.id, handle)}
                      >
                        Add to endpoint
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {providers !== null && mode.kind === 'endpoint' && (
        <EndpointForm
          title={mode.id === null ? 'Add endpoint' : 'Edit endpoint'}
          initial={mode.draft}
          onSubmit={(input) => saveEndpoint(providers, input, mode.id)}
          onRefuse={setAlert}
          onCancel={showTree}
        />
      )}

      {providers !== null && mode.kind === 'model' && (
        <ModelForm
          title={mode.handle === null ? 'Add model' : 'Edit model'}
          initial={mode.draft}
          adding={mode.handle === null}
          endpoints={providers.endpoints}
          initialEndpointId={mode.endpointId}
          onSubmit={(input, endpointId) =>
            saveModel(
              providers,
              input,
              endpointId,
              mode.handle,
              mode.endpointId,
            )
          }
          onRefuse={setAlert}
          onCancel={showTree}
        />
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
      </DialogFooter>
    </>
  );
}
