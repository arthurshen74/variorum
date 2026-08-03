/**
 * The Configurations dialog (DESIGN.md "Management UI"): four views —
 * List, Add, Edit, Endpoint. Draft state is component state here and
 * dies with the dialog; every mutation goes through the repository.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import type { Configuration } from '@/domain/types';
import {
  clearBaseUrl,
  DEFAULT_BASE_URL,
  getBaseUrl,
  parseBaseUrl,
  setBaseUrl,
} from '@/llm/transport';
import { repository } from '@/persistence/repository';
import { selectConfiguration, selectLatestVersion } from '@/state/selectors';
import { useVariorum, variorumStore } from '@/state/store';
import {
  draftEqualsVersion,
  formValuesFromVersion,
  parseConfigurationForm,
  REASONING_EFFORT_STOPS,
  type ConfigurationFormValues,
} from './configuration-form';

export interface ConfigurationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type View =
  | { kind: 'list' }
  | { kind: 'add' }
  | { kind: 'edit'; name: string }
  | { kind: 'endpoint' };

type FieldErrors = Partial<Record<keyof ConfigurationFormValues, string>>;

const BLANK_FORM: ConfigurationFormValues = {
  name: '',
  description: '',
  artifactType: '',
  modelName: '',
  systemPrompt: '',
  temperature: '',
  topP: '',
  topK: '',
  reasoningIndex: 0,
};

const SAMPLING_FIELDS = [
  { key: 'temperature', label: 'Temperature', id: 'config-temperature' },
  { key: 'topP', label: 'Top P', id: 'config-top-p' },
  { key: 'topK', label: 'Top K', id: 'config-top-k' },
] as const;

const FIELD_ERRORS_MESSAGE = 'Fix the highlighted fields.';
const INVALID_URL_MESSAGE = 'Enter a parseable http or https URL.';
const UNSET_EFFORT_LABEL = 'unset';

const LABEL_CLASS = 'text-xs font-medium';
const INPUT_CLASS =
  'w-full rounded-md border bg-background px-2 py-1 text-sm disabled:opacity-60';
const ERROR_CLASS = 'text-xs text-destructive';
const ALERT_CLASS =
  'rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs text-destructive';
const ROW_CLASS = 'flex items-center gap-2 rounded-md border px-2 py-1.5';

export default function ConfigurationsDialog({
  open,
  onOpenChange,
}: ConfigurationsDialogProps) {
  const configurations = useVariorum((s) => s.configurations);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [values, setValues] = useState<ConfigurationFormValues>(BLANK_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [endpointUrl, setEndpointUrl] = useState('');

  const active = configurations.filter((c) => !c.archived);
  const archived = configurations.filter((c) => c.archived);
  const editing = view.kind === 'edit';

  function showList() {
    setView({ kind: 'list' });
    setValues(BLANK_FORM);
    setErrors({});
    setAlert(null);
  }

  function showAdd() {
    setValues(BLANK_FORM);
    setErrors({});
    setAlert(null);
    setView({ kind: 'add' });
  }

  function showEdit(configuration: Configuration) {
    const version = selectLatestVersion(configuration.name)(
      variorumStore.getState(),
    );
    if (version === undefined) {
      throw new Error(`configuration ${configuration.name} has no version`);
    }
    setValues(formValuesFromVersion(configuration, version));
    setErrors({});
    setAlert(null);
    setView({ kind: 'edit', name: configuration.name });
  }

  function showEndpoint() {
    setEndpointUrl(getBaseUrl());
    setAlert(null);
    setView({ kind: 'endpoint' });
  }

  // Closing discards the draft, per the hard invariant: nothing is staged,
  // nothing survives to the next open.
  function handleOpenChange(next: boolean) {
    if (!next) showList();
    onOpenChange(next);
  }

  function setField(key: keyof ConfigurationFormValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function saveNew() {
    const result = parseConfigurationForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      setAlert(FIELD_ERRORS_MESSAGE);
      return;
    }
    try {
      await repository.createConfiguration(result.info, result.draft);
    } catch (error) {
      setAlert(error instanceof Error ? error.message : String(error));
      return;
    }
    showList();
  }

  /**
   * The repository's append is unconditional, so the promise that a Save
   * changing nothing mints nothing is kept here: each half is written only
   * when it differs from what is already saved.
   */
  async function saveEdit(name: string) {
    const result = parseConfigurationForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      setAlert(FIELD_ERRORS_MESSAGE);
      return;
    }

    const state = variorumStore.getState();
    const configuration = selectConfiguration(name)(state);
    const version = selectLatestVersion(name)(state);
    if (configuration === undefined || version === undefined) {
      throw new Error(`configuration ${name} vanished mid-edit`);
    }

    const description = result.info.description ?? '';
    if (description !== (configuration.description ?? '')) {
      await repository.updateConfigurationDescription(name, description);
    }
    if (!draftEqualsVersion(result.draft, version)) {
      await repository.saveConfigurationVersion(name, result.draft);
    }
    showList();
  }

  function saveEndpoint() {
    const url = parseBaseUrl(endpointUrl);
    if (url === null) {
      setAlert(INVALID_URL_MESSAGE);
      return;
    }
    setBaseUrl(url);
    setAlert(null);
  }

  function resetEndpoint() {
    clearBaseUrl();
    setEndpointUrl(DEFAULT_BASE_URL);
    setAlert(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {view.kind === 'list' && (
          <>
            <DialogHeader>
              <DialogTitle>Configurations</DialogTitle>
              <DialogDescription>
                Named recipes for producing artifacts. Versions are
                append-only, so editing one mints the next.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Button size="sm" onClick={showAdd}>
                New configuration
              </Button>
              <Button size="sm" variant="outline" onClick={showEndpoint}>
                Endpoint
              </Button>
            </div>
            {active.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No active configurations yet.
              </p>
            ) : (
              <ul className="grid gap-1">
                {active.map((configuration) => (
                  <li key={configuration.name} className={ROW_CLASS}>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {configuration.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {configuration.artifactType}
                        {configuration.description
                          ? ` · ${configuration.description}`
                          : ''}
                      </span>
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => showEdit(configuration)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        void repository.archiveConfiguration(configuration.name);
                      }}
                    >
                      Archive
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {archived.length > 0 && (
              <>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Archived
                </h3>
                <ul className="grid gap-1">
                  {archived.map((configuration) => (
                    <li
                      key={configuration.name}
                      className={`${ROW_CLASS} opacity-70`}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {configuration.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {configuration.artifactType}
                        </span>
                      </div>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          void repository.restoreConfiguration(
                            configuration.name,
                          );
                        }}
                      >
                        Restore
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {(view.kind === 'add' || view.kind === 'edit') && (
          <>
            <DialogHeader>
              <DialogTitle>
                {view.kind === 'edit'
                  ? `Edit ${view.name}`
                  : 'New configuration'}
              </DialogTitle>
              <DialogDescription>
                {editing
                  ? 'Name and artifact type are fixed at creation. A changed recipe mints the next version.'
                  : 'Saving mints version 1 of this configuration.'}
              </DialogDescription>
            </DialogHeader>
            {alert !== null && (
              <p role="alert" className={ALERT_CLASS}>
                {alert}
              </p>
            )}
            <div className="grid gap-3">
              <div className="grid gap-1">
                <label htmlFor="config-name" className={LABEL_CLASS}>
                  Name
                </label>
                <input
                  id="config-name"
                  className={INPUT_CLASS}
                  disabled={editing}
                  value={values.name}
                  onChange={(event) => setField('name', event.target.value)}
                />
                {errors.name !== undefined && (
                  <span className={ERROR_CLASS}>{errors.name}</span>
                )}
              </div>
              <div className="grid gap-1">
                <label htmlFor="config-artifact-type" className={LABEL_CLASS}>
                  Artifact type
                </label>
                <input
                  id="config-artifact-type"
                  className={INPUT_CLASS}
                  disabled={editing}
                  value={values.artifactType}
                  onChange={(event) =>
                    setField('artifactType', event.target.value)
                  }
                />
                {errors.artifactType !== undefined && (
                  <span className={ERROR_CLASS}>{errors.artifactType}</span>
                )}
              </div>
              <div className="grid gap-1">
                <label htmlFor="config-description" className={LABEL_CLASS}>
                  Description
                </label>
                <input
                  id="config-description"
                  className={INPUT_CLASS}
                  value={values.description}
                  onChange={(event) =>
                    setField('description', event.target.value)
                  }
                />
              </div>
              <div className="grid gap-1">
                <label htmlFor="config-model" className={LABEL_CLASS}>
                  Model
                </label>
                <input
                  id="config-model"
                  className={INPUT_CLASS}
                  value={values.modelName}
                  onChange={(event) => setField('modelName', event.target.value)}
                />
                {errors.modelName !== undefined && (
                  <span className={ERROR_CLASS}>{errors.modelName}</span>
                )}
              </div>
              <div className="grid gap-1">
                <label htmlFor="config-system-prompt" className={LABEL_CLASS}>
                  System prompt
                </label>
                <textarea
                  id="config-system-prompt"
                  rows={6}
                  className={INPUT_CLASS}
                  value={values.systemPrompt}
                  onChange={(event) =>
                    setField('systemPrompt', event.target.value)
                  }
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {SAMPLING_FIELDS.map((field) => (
                  <div key={field.key} className="grid gap-1">
                    <label htmlFor={field.id} className={LABEL_CLASS}>
                      {field.label}
                    </label>
                    <input
                      id={field.id}
                      inputMode="decimal"
                      placeholder="unset"
                      className={INPUT_CLASS}
                      value={values[field.key]}
                      onChange={(event) =>
                        setField(field.key, event.target.value)
                      }
                    />
                    {errors[field.key] !== undefined && (
                      <span className={ERROR_CLASS}>{errors[field.key]}</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="grid gap-2">
                <span id="config-reasoning-label" className={LABEL_CLASS}>
                  Reasoning effort:{' '}
                  {REASONING_EFFORT_STOPS[values.reasoningIndex] ??
                    UNSET_EFFORT_LABEL}
                </span>
                <Slider
                  aria-labelledby="config-reasoning-label"
                  min={0}
                  max={REASONING_EFFORT_STOPS.length - 1}
                  step={1}
                  value={[values.reasoningIndex]}
                  onValueChange={([index = 0]) =>
                    setValues((current) => ({
                      ...current,
                      reasoningIndex: index,
                    }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={showList}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  void (view.kind === 'edit' ? saveEdit(view.name) : saveNew());
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </>
        )}

        {view.kind === 'endpoint' && (
          <>
            <DialogHeader>
              <DialogTitle>Endpoint</DialogTitle>
              <DialogDescription>
                Which OpenAI-compatible server this device talks to. Device
                state — outside every configuration and every export.
              </DialogDescription>
            </DialogHeader>
            {alert !== null && (
              <p role="alert" className={ALERT_CLASS}>
                {alert}
              </p>
            )}
            <div className="grid gap-1">
              <label htmlFor="endpoint-url" className={LABEL_CLASS}>
                Endpoint URL
              </label>
              <input
                id="endpoint-url"
                className={INPUT_CLASS}
                value={endpointUrl}
                onChange={(event) => setEndpointUrl(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={showList}>
                Back
              </Button>
              <Button variant="outline" onClick={resetEndpoint}>
                Reset to default
              </Button>
              <Button onClick={saveEndpoint}>Save</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
