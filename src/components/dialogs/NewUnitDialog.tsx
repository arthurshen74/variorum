/**
 * The new-unit dialog (DESIGN.md "Management UI"): conversation name plus
 * a picker over active configurations. Create calls the repository;
 * onCreated lets AppShell select the new unit.
 */
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { repository } from '@/persistence/repository';
import { selectActiveConfigurations } from '@/state/selectors';
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

  // Empty means untouched: the picker shows the first active configuration
  // and Create uses it, so there is no placeholder option to select past.
  const selected =
    configName === '' ? (configurations[0]?.name ?? '') : configName;

  function handleOpenChange(next: boolean) {
    if (!next) {
      setConversationName('');
      setConfigName('');
    }
    onOpenChange(next);
  }

  async function create() {
    const unit = await repository.createUnit(conversationName.trim(), selected);
    onCreated(unit.id);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New unit</DialogTitle>
          <DialogDescription>
            A unit is bound to its configuration at creation, for life.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <label htmlFor="unit-conversation-name" className={LABEL_CLASS}>
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
            <label htmlFor="unit-configuration" className={LABEL_CLASS}>
              Configuration
            </label>
            <select
              id="unit-configuration"
              className={INPUT_CLASS}
              value={selected}
              onChange={(event) => setConfigName(event.target.value)}
            >
              {configurations.map((configuration) => (
                <option key={configuration.name} value={configuration.name}>
                  {configuration.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={conversationName.trim() === '' || selected === ''}
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
