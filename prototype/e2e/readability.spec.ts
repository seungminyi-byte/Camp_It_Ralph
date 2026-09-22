import { test, expect } from '@playwright/test';
import { onlyLocal, pick, report } from './helpers';

for (const width of [390, 1024, 1440]) test(`wide map, report and explicit notices ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await onlyLocal(page);
  const aiRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/generate')) aiRequests.push(request.url()); });
  await page.goto('/review');
  await expect(page.locator('.workspace-toolbar')).toBeVisible();
  expect(await page.locator('link[rel="icon"]').getAttribute('href')).toBe(await page.locator('.site-brand-mark').getAttribute('src'));
  await expect(page.locator('.site-brand-mark')).toHaveJSProperty('complete', true);
  const service = page.getByRole('button', { name: 'ⓘ 서비스 이용 안내 보기', exact: true });
  await service.focus(); await service.hover();
  await expect(page.locator('#service-usage-note')).toBeHidden();
  await service.click(); await expect(page.locator('#service-usage-note')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#service-usage-note')).toBeHidden(); await expect(service).toBeFocused();
  if (width >= 1024) {
    await page.getByRole('button', { name: '지도 크게', exact: true }).click();
    await expect(page.locator('.analysis-panel')).toBeHidden();
    expect((await page.locator('.map-column').boundingBox())!.width).toBeGreaterThan(width * .95);
    await page.screenshot({ path: info.outputPath('map-wide.png') });
    await page.locator('.map-skip-link').focus(); await page.keyboard.press('Enter');
    await expect(page.locator('.analysis-panel')).toBeVisible();
    await expect(page.locator('.analysis-panel h2').first()).toBeFocused();
    await page.getByRole('button', { name: '함께 보기', exact: true }).click();
    await expect(page.locator('.analysis-panel')).toBeVisible();
  } else {
    await page.getByRole('button', { name: '지도 보기', exact: true }).click();
    await expect(page.locator('.map-column')).toBeVisible();
    await page.getByRole('button', { name: '검토 결과', exact: true }).click();
  }
  await pick(page);
  const source = page.getByRole('button', { name: '자료별 유의사항 보기', exact: false });
  await source.scrollIntoViewIfNeeded(); await source.focus(); await source.hover();
  await expect(page.locator('#disclaimer-detail')).toBeHidden();
  await source.click(); await expect(page.locator('#disclaimer-detail')).toBeVisible();
  await expect(page.locator('#disclaimer-detail')).toContainText('한국전력 공식 전력공급 가능 검토');
  await page.keyboard.press('Escape'); await expect(page.locator('#disclaimer-detail')).toBeHidden(); await expect(source).toBeFocused();
  await report(page);
  if (width >= 1024) {
    await expect(page.getByRole('button', { name: '결과 크게', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.map-column')).toBeHidden();
    expect((await page.locator('.report-screen').boundingBox())!.width).toBeGreaterThan(width * .85);
  }
  expect(await page.locator('.report-screen').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(15);
  expect(await page.locator('.report-preview-shell').evaluate(element => getComputedStyle(element).maxHeight)).toBe('none');
  await expect(page.locator('#print-root .business-checklist tbody tr')).toHaveCount(18);
  await expect(page.locator('#print-root')).toContainText('한전 공식 검토·법률 판단 대체 불가');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(aiRequests).toEqual([]);
  await page.locator('.report-frozen-preview').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('report-wide.png') });
});
