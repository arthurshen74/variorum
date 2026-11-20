/**
 * The new-unit dialog (DESIGN.md "Management UI"): conversation name plus
 * a picker over active configurations. When the chosen configuration
 * names an unbound handle, a Model picker joins them and Create first
 * saves the next version with the chosen handle (DESIGN.md "First-Run
 * Setup", "Choosing a model at use"). onCreated lets AppShell select the
 * new unit.
 */
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  createUnitWithModel,
  modelChoiceFor,
} from '@/components/setup/model-choice';
import { ModelChoicePicker } from '@/components/setup/ModelChoicePicker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { readProviderDocumentOrNull } from '@/llm/provider-document';
import { repository } from '@/persistence/repository';
import {
  selectActiveConfigurations,
  selectLatestVersion,
} from '@/state/selectors';
import { useVariorum } from '@/state/store';

export interface NewUnitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (unitId: string) => void;
}

const LABEL_CLASS = 'text-xs font-medium';
const INPUT_CLASS = 'w-full rounded-md border bg-background px-2 py-1 text-sm';

export default function NewUnitDialog({
  open,
  onOpenChange,
  onCreated,
}: NewUnitDialogProps) {
  const configurations = useVariorum(useShallow(selectActiveConfigurations));
  const [conversationName, setConversationName] = useState('');
  const [configName, setConfigName] = useState('');
  const [handle, setHandle] = useState('');

  // Empty means untouched: the picker shows the first active configuration
  // and Create uses it, so there is no placeholder option to select past.
  const selected =
    configName === '' ? (configurations[0]?.name ?? '') : configName;
  const version = useVariorum(selectLatestVersion(selected));

  // Read on every open render, so a model deleted mid-session is seen.
  const choice =
    open && version !== undefined ?
      modelChoiceFor(version, readProviderDocumentOrNull())
    : null;
  // Same convention for the Model picker: untouched means the first handle.
  const chosenHandle =
    choice === null ? null
    : choice.handles.includes(handle) ? handle
    : (choice.handles[0] ?? null);
  const noModel = choice !== null && chosenHandle === null;

  function handleOpenChange(next: boolean) {
    if (!next) {
      setConversationName('');
      setConfigName('');
      setHandle('');
    }
    onOpenChange(next);
  }

  async function create() {
    if (version === undefined) return;
    const unit = await createUnitWithModel(
      repository,
      conversationName.trim(),
      version,
      chosenHandle,
    );
    onCreated(unit.id);
    handleOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New unit</DialogTitle>
          <DialogDescription>
            A unit is bound to its configuration at creation, for life.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <label
              htmlFor="unit-conversation-name"
              className={LABEL_CLASS}
            >
              Conversation name
            </label>
            <input
              id="unit-conversation-name"
              className={INPUT_CLASS}
              value={conversationName}
              onChange={(event) => setConversationName(event.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <label
              htmlFor="unit-configuration"
              className={LABEL_CLASS}
            >
              Configuration
            </label>
            <select
              id="unit-configuration"
              className={INPUT_CLASS}
              value={selected}
              onChange={(event) => setConfigName(event.target.value)}
            >
              {configurations.map((configuration) => (
                <option
                  key={configuration.name}
                  value={configuration.name}
                >
                  {configuration.name}
                </option>
              ))}
            </select>
          </div>
          {choice !== null && chosenHandle !== null ?
            <>
              <ModelChoicePicker
                handles={choice.handles}
                value={chosenHandle}
                onChange={setHandle}
              />
              <p className="text-xs text-muted-foreground">
                Saves {choice.designator} with model {chosenHandle}
              </p>
            </>
          : null}
          {noModel ?
            <p className="text-xs text-muted-foreground">
              No model is set up on this machine. Add one in Models/Providers,
              then come back.
            </p>
          : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={
              conversationName.trim() === '' || selected === '' || noModel
            }
            onClick={() => {
              void create();
            }}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
