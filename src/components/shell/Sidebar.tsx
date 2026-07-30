/**
 * Left sidebar: active units, configuration entry point. Reads through
 * selectors only; every action goes through the repository (or will, once
 * the dialogs land).
 */
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useVariorum } from '@/state/store';
import { selectActiveUnits } from '@/state/selectors';
import {
  getThemePreference,
  parseThemePreference,
  setThemePreference,
} from '@/state/theme';

interface SidebarProps {
  activeUnitId: string | null;
  onSelectUnit: (unitId: string) => void;
}

export default function Sidebar({ activeUnitId, onSelectUnit }: SidebarProps) {
  // useShallow: the selector builds a new array; shallow-compare it so
  // React's snapshot stays stable (zustand v5 requirement for collections).
  const units = useVariorum(useShallow(selectActiveUnits));
  const [theme, setTheme] = useState(getThemePreference);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-muted/30">
      <div className="flex h-11 items-center justify-between border-b px-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Units
        </span>
        <button
          type="button"
          disabled
          title="Arrives with the configuration dialog"
          className="rounded-md px-2 py-0.5 text-sm text-muted-foreground opacity-50"
        >
          +
        </button>
      </div>
      <nav className="min-h-0 flex-1 overflow-auto p-2">
        {units.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            No units yet. Create a configuration first, then a unit.
          </p>
        ) : (
          <ul className="space-y-1">
            {units.map((unit) => (
              <li key={unit.id}>
                <button
                  type="button"
                  onClick={() => onSelectUnit(unit.id)}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${
                    unit.id === activeUnitId ? 'bg-accent font-medium' : ''
                  }`}
                >
                  <span className="block truncate">{unit.conversationName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {unit.configName}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
      <div className="border-t p-2">
        <button
          type="button"
          disabled
          title="Configuration dialog arrives next"
          className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground opacity-50"
        >
          ⚙ Configurations
        </button>
        <div className="flex items-center justify-between px-2 py-1.5">
          <label
            htmlFor="theme-preference"
            className="text-xs text-muted-foreground"
          >
            Theme
          </label>
          <select
            id="theme-preference"
            value={theme}
            onChange={(event) => {
              const preference = parseThemePreference(event.target.value);
              setTheme(preference);
              setThemePreference(preference);
            }}
            className="rounded-md border bg-background px-1.5 py-0.5 text-xs"
          >
            <option value="auto">Auto</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>
    </aside>
  );
}
