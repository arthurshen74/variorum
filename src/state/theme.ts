/**
 * The theming mechanism (DESIGN.md "Theming"): the ONLY code that toggles
 * the `dark` class on the document element. The preference (auto | light |
 * dark) persists in localStorage as device state — never in the Zustand
 * store, never in IndexedDB, never in an export. Auto follows the
 * browser's prefers-color-scheme and reacts live via a matchMedia
 * listener.
 */

const THEME_KEY = 'variorum.theme';

export type ThemePreference = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export function parseThemePreference(raw: string | null): ThemePreference {
  return raw === 'auto' || raw === 'light' || raw === 'dark' ? raw : 'auto';
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'auto') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  return preference;
}

export function getThemePreference(): ThemePreference {
  return parseThemePreference(localStorage.getItem(THEME_KEY));
}

export function setThemePreference(preference: ThemePreference): void {
  localStorage.setItem(THEME_KEY, preference);
  apply();
}

let systemScheme: MediaQueryList | null = null;

function systemSchemeQuery(): MediaQueryList {
  if (systemScheme === null) {
    systemScheme = window.matchMedia('(prefers-color-scheme: dark)');
    systemScheme.addEventListener('change', () => {
      if (getThemePreference() === 'auto') {
        apply();
      }
    });
  }
  return systemScheme;
}

function apply(): void {
  const resolved = resolveTheme(getThemePreference(), systemSchemeQuery().matches);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

/** Called once in main.tsx, before first render — no light flash on a dark boot. */
export function initTheme(): void {
  apply();
}
