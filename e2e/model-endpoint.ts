/**
 * Seeds the model binding that points a spec's app at its scripted
 * endpoint (DESIGN.md "Model Bindings") — device state, so seeded
 * directly rather than driven through the Models view every time.
 * The legacy `variorum.baseUrl` key is seeded too: the pre-binding
 * transport still reads it until the transport group of the
 * model-bindings manifest lands, and dropping that line is the cleanup
 * amendment recorded there.
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
        `variorum.model.${modelName}`,
        JSON.stringify({ api: 'openai-compatible', endpointUrl: url }),
      );
      localStorage.setItem('variorum.baseUrl', url);
    },
    { url, modelName },
  );
}
