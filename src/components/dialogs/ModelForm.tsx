/**
 * The model form of the Models/Providers view (DESIGN.md "Management
 * UI", "Models and Providers"): the wire model name, the handle
 * configurations use, which endpoint serves it, and the two fields the
 * chosen endpoint decides on — a key when it authenticates, an output
 * cap when its adapter carries one.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { protocolAdapter } from '@/llm/protocols/registry';
import type { Endpoint } from '@/llm/provider-document';
import type { ModelInput } from '@/llm/provider-mutations';
import {
  endpointLabel,
  parseModelDraft,
  type ModelDraft,
} from './provider-form';

export interface ModelFormProps {
  title: string;
  initial: ModelDraft;
  /** Adding mirrors the handle onto the model name as it is typed. */
  adding: boolean;
  endpoints: Endpoint[];
  initialEndpointId: string;
  onSubmit: (input: ModelInput, endpointId: string) => void;
  onRefuse: (message: string) => void;
  onCancel: () => void;
}

function endpointById(endpoints: Endpoint[], id: string): Endpoint {
  const endpoint = endpoints.find((candidate) => candidate.id === id);
  if (endpoint === undefined) throw new Error(`unknown endpoint id: ${id}`);
  return endpoint;
}

const LABEL_CLASS = 'text-xs font-medium';
const INPUT_CLASS = 'w-full rounded-md border bg-background px-2 py-1 text-sm';

export default function ModelForm({
  title,
  initial,
  adding,
  endpoints,
  initialEndpointId,
  onSubmit,
  onRefuse,
  onCancel,
}: ModelFormProps) {
  const [draft, setDraft] = useState(initial);
  const [endpointId, setEndpointId] = useState(initialEndpointId);
  // Once the handle is typed at, it stops following the model name — an
  // edit never renames the handle configurations already name.
  const [mirrorHandle, setMirrorHandle] = useState(adding);

  const endpoint = endpointById(endpoints, endpointId);

  function setModelName(value: string) {
    setDraft((current) => ({
      ...current,
      modelName: value,
      ...(mirrorHandle ? { handle: value } : {}),
    }));
  }

  function setHandle(value: string) {
    setMirrorHandle(false);
    setDraft((current) => ({ ...current, handle: value }));
  }

  function save() {
    const result = parseModelDraft(draft, endpoint);
    if (!result.ok) {
      onRefuse(result.message);
      return;
    }
    onSubmit(result.input, endpointId);
  }

  return (
    <div className="grid gap-3">
      <h3 className="text-sm font-medium">{title}</h3>

      <div className="grid gap-1">
        <label htmlFor="model-name" className={LABEL_CLASS}>
          Model name
        </label>
        <input
          id="model-name"
          className={INPUT_CLASS}
          value={draft.modelName}
          onChange={(event) => setModelName(event.target.value)}
        />
      </div>

      <div className="grid gap-1">
        <label htmlFor="model-handle" className={LABEL_CLASS}>
          Handle
        </label>
        <input
          id="model-handle"
          className={INPUT_CLASS}
          value={draft.handle}
          onChange={(event) => setHandle(event.target.value)}
        />
      </div>

      <div className="grid gap-1">
        <span className={LABEL_CLASS}>Endpoint</span>
        <Select value={endpointId} onValueChange={setEndpointId}>
          <SelectTrigger aria-label="Endpoint" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {endpoints.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {endpointLabel(candidate)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {endpoint.authRequired && (
        <div className="grid gap-1">
          <label htmlFor="model-api-key" className={LABEL_CLASS}>
            API key
          </label>
          <input
            id="model-api-key"
            type="password"
            className={INPUT_CLASS}
            value={draft.apiKey}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                apiKey: event.target.value,
              }))
            }
          />
        </div>
      )}

      {protocolAdapter(endpoint.api).usesMaxOutputTokens && (
        <div className="grid gap-1">
          <label htmlFor="model-max-output-tokens" className={LABEL_CLASS}>
            Max output tokens
          </label>
          <input
            id="model-max-output-tokens"
            inputMode="numeric"
            placeholder="default"
            className={INPUT_CLASS}
            value={draft.maxOutputTokens}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                maxOutputTokens: event.target.value,
              }))
            }
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}
