import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { onlyLocal, pick, report, navigate } from './helpers';

test('R30 pending AI is invalid after change-revert and route unmount; late response cannot return', async ({ page }) => {
  await onlyLocal(page);
  const valid = readFileSync(new URL('./ai.txt', import.meta.url), 'utf8') + '\nLATE_RESPONSE_END';
  let release: (() => void) | undefined;
  let pending = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route('**/api/generate', async route => {
    requests++;
    await pending;
    await route.fulfill({ contentType: 'text/plain', body: valid }).catch(() => {});
  });
  await page.goto('/review'); await pick(page); await report(page);
  await page.locator('.report-ai-button').click(); await expect.poll(() => requests).toBe(1);
  await page.getByRole('button', { name: /상세조건 입력/ }).click();
  const land = page.getByRole('spinbutton', { name: /대지면적/ });
  await land.fill('10000'); await land.fill('');
  release!();
  await page.getByRole('button', { name: '보고서 · PDF', exact: true }).click();
  await expect(page.locator('.memo-panel')).toContainText('이전 AI 의견을 해제');
  await expect(page.locator('.memo-panel')).not.toContainText('LATE_RESPONSE_END');
  await expect(page.locator('.memo-panel input[type=checkbox]')).toHaveCount(0);
  pending = new Promise<void>(resolve => { release = resolve; });
  await page.locator('.report-ai-button').click(); await expect.poll(() => requests).toBe(2);
  await navigate(page, '팀 소개'); release!(); await navigate(page, '부지 검토');
  await report(page);
  await expect(page.locator('.memo-panel')).not.toContainText('LATE_RESPONSE_END');
  await expect(page.locator('#print-root .report-ai')).toHaveCount(0);
  await expect(page.locator('.report-ai-button')).toContainText('AI 검토 의견 생성');
});
