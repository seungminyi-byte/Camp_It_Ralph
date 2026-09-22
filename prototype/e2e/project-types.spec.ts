import { test, expect } from '@playwright/test';
import { onlyLocal, pick, input } from './helpers';

test('fictional area example removes inert type controls, fixes area, and preserves the prior review', async ({ page }) => {
  await onlyLocal(page); await page.goto('/review'); await pick(page);
  await input(page);
  await page.getByRole('spinbutton', { name: /대지면적/ }).fill('12345');
  await page.goto('/review?example=area');
  await expect(page.getByRole('region', { name: '가상 사업조건 예시' })).toBeVisible();
  await expect(page.locator('.design-assessment')).toHaveClass(/is-shortfall/);
  await expect(page.locator('.design-assessment')).toContainText('67%');
  await expect(page.locator('input[name="project-type"]')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: '사업 유형', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '대지를 15,000㎡로 바꿔 충족 확인' }).click();
  await expect(page.locator('.design-assessment')).toContainText('100%');
  await expect(page).toHaveURL(/\/review$/);
  await page.getByRole('button', { name: '예시 종료 · 기존 검토로 돌아가기' }).click();
  await expect(page.getByRole('region', { name: '가상 사업조건 예시' })).toHaveCount(0);
  await input(page);
  await expect(page.getByRole('spinbutton', { name: /대지면적/ })).toHaveValue('12345');
});

test('comparison link loads two labeled examples without manual pinning', async ({ page }) => {
  await onlyLocal(page); await page.goto('/review?example=compare');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('가상 부지 A');
  await expect(page.getByRole('dialog')).toContainText('가상 부지 B');
  await expect(page.locator('.header-saved')).toContainText('2');
});

test('same-path example links load once, and selecting a real address exits the example', async ({ page }) => {
  await onlyLocal(page); await page.goto('/review'); await pick(page);
  await page.locator('.site-header').evaluate(header => {
    const link = document.createElement('a'); link.href = '/review?example=area'; link.textContent = '면적 예시 재진입'; header.append(link);
  });
  await page.getByRole('link', { name: '면적 예시 재진입' }).click();
  await expect(page.getByRole('region', { name: '가상 사업조건 예시' })).toBeVisible();
  await page.getByRole('button', { name: '대지를 15,000㎡로 바꿔 충족 확인' }).click();
  await expect(page.locator('.design-assessment')).toContainText('100%');
  await pick(page, '36.5067, 127.3007');
  await expect(page.getByRole('region', { name: '가상 사업조건 예시' })).toHaveCount(0);
  await expect(page.locator('.current-selection')).not.toContainText('가상');
  await input(page);
  await expect(page.getByRole('spinbutton', { name: /대지면적/ })).toHaveValue('');
});
