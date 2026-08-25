/**
 * The endpoint form of the Models/Providers view (DESIGN.md "Management
 * UI", "Models and Providers"): URL, wire protocol, whether the endpoint
 * wants a key, and — only then — the key itself. Draft state is local and
 * dies with the form; the view owns the document.
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
import type { ApiProtocol } from '@/llm/protocols/adapter';
import { apiProtocols, protocolAdapter } from '@/llm/protocols/registry';
import type { EndpointInput } from '@/llm/provider-mutations';
import { parseEndpointDraft, type EndpointDraft } from './provider-form';

const LABEL_CLASS = 'text-xs font-medium';
const INPUT_CLASS = 'w-full rounded-md border bg-background px-2 py-1 text-sm';

export interface EndpointFormProps {
  title: string;
  initial: EndpointDraft;
  onSubmit: (input: EndpointInput) => void;
  onRefuse: (message: string) => void;
  onCancel: () => void;
}

export default function EndpointForm({
  title,
  initial,
  onSubmit,
  onRefuse,
  onCancel,
}: EndpointFormProps) {
  const [draft, setDraft] = useState(initial);

  function setField<K extends keyof EndpointDraft>(
    key: K,
    value: EndpointDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function save() {
    const result = parseEndpointDraft(draft);
    if (!result.ok) {
      onRefuse(result.message);
      return;
    }
    onSubmit(result.input);
  }

  return (
    <div className="grid gap-3">
      <h3 className="text-sm font-medium">{title}</h3>

      <div className="grid gap-1">
        <label htmlFor="endpoint-url" className={LABEL_CLASS}>
          Endpoint URL
        </label>
        <input
          id="endpoint-url"
          className={INPUT_CLASS}
          value={draft.url}
          onChange={(event) => setField('url', event.target.value)}
        />
      </div>

      <div className="grid gap-1">
        <span className={LABEL_CLASS}>Protocol</span>
        <Select
          value={draft.api}
          onValueChange={(value) => setField('api', value as ApiProtocol)}
        >
          <SelectTrigger aria-label="Protocol" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {apiProtocols().map((protocol) => (
              <SelectItem key={protocol} value={protocol}>
                {protocolAdapter(protocol).label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="endpoint-auth-required"
          type="checkbox"
          checked={draft.authRequired}
          onChange={(event) => setField('authRequired', event.target.checked)}
        />
        <label htmlFor="endpoint-auth-required" className={LABEL_CLASS}>
          Requires authentication
        </label>
      </div>

      {draft.authRequired && (
        <div className="grid gap-1">
          <label htmlFor="endpoint-api-key" className={LABEL_CLASS}>
            API key
          </label>
          <input
            id="endpoint-api-key"
            type="password"
            className={INPUT_CLASS}
            value={draft.apiKey}
            onChange={(event) => setField('apiKey', event.target.value)}
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
