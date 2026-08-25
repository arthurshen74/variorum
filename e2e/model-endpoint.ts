/**
 * Seeds the Models/Providers document that points a spec's app at its
 * scripted endpoint (DESIGN.md "Models and Providers") — device state, so
 * seeded directly rather than driven through the tree every time.
 */
import type { Page } from '@playwright/test';

export const MOCK_MODEL = 'mock-model';

export async function seedModelEndpoint(
  page: Page,
  url: string,
  modelName: string = MOCK_MODEL,
): Promise<void> {
  await page.addInitScript(
    ({ url, modelName }) => {
      localStorage.setItem(
        'variorum.llm',
        JSON.stringify({
          endpoints: [
            {
              id: 'ep-scripted',
              url,
              api: 'openai-compatible',
              authRequired: false,
              models: [{ modelName, handle: modelName }],
            },
          ],
        }),
      );
    },
    { url, modelName },
  );
}
