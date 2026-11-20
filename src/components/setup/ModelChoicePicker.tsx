/**
 * The Model picker both model-choice surfaces show (DESIGN.md "First-Run
 * Setup", "Choosing a model at use"): a native select over the handles
 * the document binds. Choosing saves nothing; the surface's labelled
 * button is the Save.
 */
import { useId } from 'react';

export interface ModelChoicePickerProps {
  handles: string[];
  value: string;
  onChange: (handle: string) => void;
}

export function ModelChoicePicker({
  handles,
  value,
  onChange,
}: ModelChoicePickerProps) {
  const id = useId();
  return (
    <div className="grid gap-1">
      <label
        htmlFor={id}
        className="text-xs font-medium"
      >
        Model
      </label>
      <select
        id={id}
        className="w-full rounded-md border bg-background px-2 py-1 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {handles.map((handle) => (
          <option
            key={handle}
            value={handle}
          >
            {handle}
          </option>
        ))}
      </select>
    </div>
  );
}
