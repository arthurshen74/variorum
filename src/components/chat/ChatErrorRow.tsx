/**
 * The transcript's error row (DESIGN.md "Chat", Errors): the failure text
 * and Retry. When the unit's configuration names a handle the document
 * does not bind, it also offers the Model picker and a button that saves
 * the next version with the chosen handle, then retries (DESIGN.md
 * "First-Run Setup", "Choosing a model at use"). The offer is derived
 * from the version and the document, never from the error text.
 */
import { useState } from 'react';
import { modelChoiceFor, rebindDraft } from '@/components/setup/model-choice';
import { ModelChoicePicker } from '@/components/setup/ModelChoicePicker';
import type { ConfigurationVersion } from '@/domain/types';
import { readProviderDocumentOrNull } from '@/llm/provider-document';
import { repository } from '@/persistence/repository';

export interface ChatErrorRowProps {
  message: string;
  /** The latest saved version of the unit's configuration. */
  version: ConfigurationVersion | undefined;
  onRetry: () => void;
}

const BUTTON_CLASS =
  'w-fit rounded-md border px-2 py-1 font-medium hover:bg-accent';

interface Offer {
  version: ConfigurationVersion;
  designator: string;
  handles: string[];
  /** The picker's handle; untouched means the first, as in New unit. */
  handle: string;
}

/**
 * What the row offers beyond Retry: nothing when the handle is bound
 * (a missing key included) or when the document holds no model to pick.
 */
function offerFor(
  version: ConfigurationVersion | undefined,
  picked: string,
): Offer | null {
  if (version === undefined) return null;
  const choice = modelChoiceFor(version, readProviderDocumentOrNull());
  if (choice === null) return null;
  const handle = choice.handles.includes(picked) ? picked : choice.handles[0];
  if (handle === undefined) return null;
  return {
    version,
    designator: choice.designator,
    handles: choice.handles,
    handle,
  };
}

export function ChatErrorRow({ message, version, onRetry }: ChatErrorRowProps) {
  const [handle, setHandle] = useState('');

  const offer = offerFor(version, handle);

  async function saveAndRetry({ version, handle }: Offer) {
    await repository.saveConfigurationVersion(
      version.name,
      rebindDraft(version, handle),
    );
    onRetry();
  }

  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs"
    >
      <span className="text-destructive">{message}</span>
      {offer === null ? null : (
        <ModelChoicePicker
          handles={offer.handles}
          value={offer.handle}
          onChange={setHandle}
        />
      )}
      <div className="flex gap-2">
        {offer === null ? null : (
          <button
            type="button"
            onClick={() => void saveAndRetry(offer)}
            className={BUTTON_CLASS}
          >
            Save {offer.designator} and retry
          </button>
        )}
        <button
          type="button"
          onClick={onRetry}
          className={BUTTON_CLASS}
        >
          Retry
        </button>
      </div>
    </div>
  );
}
