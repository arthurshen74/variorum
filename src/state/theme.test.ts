/**
 * The theme mechanism's pure core (DESIGN.md "Theming"): preference
 * parsing and light/dark resolution. DOM application — the class toggle,
 * the live matchMedia reaction — is covered by e2e/theme.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import { parseThemePreference, resolveTheme } from './theme';

describe('resolveTheme', () => {
  it('resolves auto to dark when the system prefers dark', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
  });

  it('resolves auto to light when the system prefers light', () => {
    expect(resolveTheme('auto', false)).toBe('light');
  });

  it('resolves light to light even when the system prefers dark', () => {
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('resolves dark to dark even when the system prefers light', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('parseThemePreference', () => {
  it('parses a missing stored value as auto', () => {
    expect(parseThemePreference(null)).toBe('auto');
  });

  it('parses an unrecognized stored value as auto', () => {
    expect(parseThemePreference('solarized')).toBe('auto');
  });
});
