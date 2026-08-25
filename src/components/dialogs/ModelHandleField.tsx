/**
 * The configuration form's Model field (DESIGN.md "Management UI", Add):
 * a free-text input plus a popover listbox offering every handle bound in
 * the Models/Providers document. The list is unfiltered when opened, so a
 * prefilled value never hides the other handles; typing while it is open
 * filters it. Free text stays legal — a configuration may name a handle
 * this machine has not bound yet.
 */
import { useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface ModelHandleFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  handles: string[];
  className?: string;
}

const TOGGLE_LABEL = 'Show bound handles';

export function ModelHandleField({
  id,
  value,
  onChange,
  handles,
  className,
}: ModelHandleFieldProps) {
  const [open, setOpen] = useState(false);
  const [typedSinceOpen, setTypedSinceOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const listboxId = `${id}-listbox`;
  const options = typedSinceOpen
    ? handles.filter((h) => h.toLowerCase().includes(value.toLowerCase()))
    : handles;

  function openList() {
    setTypedSinceOpen(false);
    setActiveIndex(-1);
    setOpen(true);
  }

  function select(handle: string) {
    onChange(handle);
    setOpen(false);
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) openList();
      else setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (open) setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault();
      const active = options[activeIndex];
      if (active !== undefined) select(active);
    } else if (event.key === 'Escape' && open) {
      // Swallowed so the surrounding dialog stays open.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className="relative">
          <input
            ref={inputRef}
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined
            }
            className={cn(className, 'pr-8')}
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              if (open) {
                setTypedSinceOpen(true);
                setActiveIndex(-1);
              }
            }}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            aria-label={TOGGLE_LABEL}
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-muted-foreground"
            onClick={() => {
              if (open) {
                setOpen(false);
              } else {
                openList();
              }
              inputRef.current?.focus();
            }}
          >
            <ChevronDownIcon className="size-4" />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          // Clicks on the input or toggle are the field, not a dismissal.
          if (anchorRef.current?.contains(event.target as Node)) {
            event.preventDefault();
          }
        }}
      >
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Bound handles"
          className="max-h-56 overflow-y-auto"
        >
          {options.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              No matching handles
            </li>
          )}
          {options.map((handle, index) => (
            <li
              key={handle}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={handle === value}
              className={cn(
                'flex cursor-default items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground',
                index === activeIndex && 'bg-accent text-accent-foreground',
              )}
              onClick={() => select(handle)}
            >
              {handle}
              {handle === value && <CheckIcon className="size-4" />}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
