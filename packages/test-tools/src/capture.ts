import type { Page } from '@playwright/test';
export async function capture(page: Page, path: string) {
  await page.screenshot({ path, fullPage: true });
}
