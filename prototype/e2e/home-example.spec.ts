import { test, expect } from '@playwright/test';
import { onlyLocal } from './helpers';
for (const width of [390, 768, 1440]) test(`home shows a scored product example at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await onlyLocal(page);
  await page.goto('/');
  const picture = page.locator('.product-example img');
  await expect(picture).toHaveAttribute('alt', /77점, B등급/);
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await picture.evaluate((img: HTMLImageElement) => img.currentSrc)).toContain('review-score-example');
  await expect(page.locator('.product-example')).toContainText('실제 부지 판정 아님');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/project#example');
  await expect(page.locator('#example')).toContainText('확보 대지 20,000㎡');
  await expect(page.locator('#example')).toContainText('참고점수 77점·B등급');
});
