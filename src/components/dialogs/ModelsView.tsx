/**
 * The Models view of the Configurations dialog (DESIGN.md "Management
 * UI", "Model Bindings"): one section per model name the configurations
 * can currently target, each holding that model's binding — device
 * state in localStorage, outside every configuration and every export.
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  clearModelBinding,
  getModelBinding,
  setModelBinding,
  type ApiProtocol,
} from '@/llm/model-binding';
import { useVariorum } from '@/state/store';
import {
  boundModelNames,
  draftFromBinding,
  parseBindingDraft,
  type ModelBindingDraft,
} from './model-binding-form';

export interface ModelsViewProps {
  onBack: () => void;
}

const API_PROTOCOLS: ApiProtocol[] = [
  'openai-compatible',
  'anthropic-messages',
];

const MESSAGES_API: ApiProtocol = 'anthropic-messages';

const SAVE_BLOCKED_MESSAGE =
  'Enter a parseable http or https URL, and a numeric max output tokens.';

const LABEL_CLASS = 'text-xs font-medium';
const INPUT_CLASS = 'w-full rounded-md border bg-background px-2 py-1 text-sm';
const ALERT_CLASS =
  'rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs text-destructive';

export default function ModelsView({ onBack }: ModelsViewProps) {
  const configurations = useVariorum((s) => s.configurations);
  const versions = useVariorum((s) => s.configurationVersions);
  // Only the models whose fields the user has touched; every other row
  // derives from localStorage on render, so a Reset — or a model that
  // appears while the view is open — needs no effect to stay honest.
  const [drafts, setDrafts] = useState<Record<string, ModelBindingDraft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const modelNames = boundModelNames(configurations, versions);

  function draftFor(modelName: string): ModelBindingDraft {
    return drafts[modelName] ?? draftFromBinding(getModelBinding(modelName));
  }

  function setField(
    modelName: string,
    field: keyof ModelBindingDraft,
    value: string,
  ) {
    setDrafts((current) => ({
      ...current,
      [modelName]: { ...draftFor(modelName), [field]: value },
    }));
  }

  function save(modelName: string) {
    const binding = parseBindingDraft(draftFor(modelName));
    if (binding === null) {
      setErrors((current) => ({
        ...current,
        [modelName]: SAVE_BLOCKED_MESSAGE,
      }));
      return;
    }
    setModelBinding(modelName, binding);
    // Re-seeded from what was stored, so the fields show the trimmed,
    // protocol-filtered record rather than what was typed at it.
    setDrafts((current) => ({
      ...current,
      [modelName]: draftFromBinding(binding),
    }));
    clearError(modelName);
  }

  function reset(modelName: string) {
    clearModelBinding(modelName);
    setDrafts((current) => {
      const { [modelName]: _dropped, ...rest } = current;
      return rest;
    });
    clearError(modelName);
  }

  function clearError(modelName: string) {
    setErrors((current) => {
      const { [modelName]: _dropped, ...rest } = current;
      return rest;
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Models</DialogTitle>
        <DialogDescription>
          How this device reaches each model the configurations name. Device
          state — outside every configuration and every export.
        </DialogDescription>
      </DialogHeader>

      {modelNames.length === 0 ?
        <p className="text-xs text-muted-foreground">
          No models to bind yet. Create a configuration first.
        </p>
      : <div className="grid gap-3">
          {modelNames.map((modelName) => {
            const draft = draftFor(modelName);
            const error = errors[modelName];
            return (
              <fieldset
                key={modelName}
                className="grid gap-2 rounded-md border px-2 py-1.5"
              >
                <legend className="px-1 text-xs font-medium">
                  {modelName}
                </legend>
                {error !== undefined && (
                  <p role="alert" className={ALERT_CLASS}>
                    {error}
                  </p>
                )}
                <div className="grid gap-1">
                  <span className={LABEL_CLASS}>API</span>
                  <Select
                    value={draft.api}
                    onValueChange={(value) =>
                      setField(modelName, 'api', value)
                    }
                  >
                    <SelectTrigger aria-label="API" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {API_PROTOCOLS.map((protocol) => (
                        <SelectItem key={protocol} value={protocol}>
                          {protocol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Wrapping labels, not htmlFor: a model name is free text
                    and would make a poor element id. */}
                <label className="grid gap-1">
                  <span className={LABEL_CLASS}>Endpoint URL</span>
                  <input
                    className={INPUT_CLASS}
                    value={draft.endpointUrl}
                    onChange={(event) =>
                      setField(modelName, 'endpointUrl', event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-1">
                  <span className={LABEL_CLASS}>API key</span>
                  <input
                    type="password"
                    className={INPUT_CLASS}
                    value={draft.apiKey}
                    onChange={(event) =>
                      setField(modelName, 'apiKey', event.target.value)
                    }
                  />
                </label>
                {draft.api === MESSAGES_API && (
                  <label className="grid gap-1">
                    <span className={LABEL_CLASS}>Max output tokens</span>
                    <input
                      inputMode="numeric"
                      placeholder="default"
                      className={INPUT_CLASS}
                      value={draft.maxOutputTokens}
                      onChange={(event) =>
                        setField(
                          modelName,
                          'maxOutputTokens',
                          event.target.value,
                        )
                      }
                    />
                  </label>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => reset(modelName)}
                  >
                    Reset
                  </Button>
                  <Button size="xs" onClick={() => save(modelName)}>
                    Save
                  </Button>
                </div>
              </fieldset>
            );
          })}
        </div>
      }

      <DialogFooter>
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
      </DialogFooter>
    </>
  );
}
