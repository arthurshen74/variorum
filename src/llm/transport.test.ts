/**
 * Unit tests for the endpoint URL's pure core (DESIGN.md "API Keys &
 * Endpoint URL"): boundary validation only. Storage roundtrip, reset,
 * and export-invisibility are covered by e2e/management-ui.spec.ts —
 * the same split as the theme mechanism.
 */
import { describe, expect, it } from 'vitest';
import { parseBaseUrl } from './transport';

describe('[G3] parseBaseUrl', () => {
  it('accepts an http or https URL and returns it trimmed', () => {
    expect(parseBaseUrl('http://localhost:1234/v1')).toBe(
      'http://localhost:1234/v1',
    );
    expect(parseBaseUrl('  https://example.com/v1  ')).toBe(
      'https://example.com/v1',
    );
  });

  it('rejects non-URL text and non-http(s) schemes', () => {
    expect(parseBaseUrl('not a url')).toBeNull();
    expect(parseBaseUrl('ftp://example.com/v1')).toBeNull();
    expect(parseBaseUrl('file:///etc/passwd')).toBeNull();
  });

  it('rejects blank input', () => {
    expect(parseBaseUrl('')).toBeNull();
    expect(parseBaseUrl('   ')).toBeNull();
  });
});
