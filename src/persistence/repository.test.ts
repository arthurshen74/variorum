/**
 * Repository behavior against fake-indexeddb. The export dump's shape is
 * closed: exactly the three collections plus schemaVersion. Device state
 * (the theme preference, API keys) lives in localStorage and must never
 * ride along (DESIGN.md "Theming").
 */
import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { repository } from './repository';

it('export dump contains exactly the three collections and no theme field', async () => {
  await repository.boot();
  const dump = await repository.exportDatabase();
  expect(Object.keys(dump).sort()).toEqual(
    ['configurations', 'configurationVersions', 'schemaVersion', 'units'].sort(),
  );
  expect(JSON.stringify(dump)).not.toContain('theme');
});
