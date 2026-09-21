import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
export const fixtures = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));
export async function pick(page: Page, query = '36.4967, 127.3007') {
  await page.getByRole('combobox', { name: '부지 검색' }).fill(query);
  await page.getByRole('combobox', { name: '부지 검색' }).press('Enter');
  await expect(page.locator('.result-overview')).toBeVisible();
  await page.waitForLoadState('networkidle');
}
export async function input(page: Page) { await page.getByRole('button', { name: /상세조건 입력/ }).click(); }
export async function numeric(page: Page) {
  await input(page);
  for (const [label, value] of [['대지면적','10000'],['계획 연면적','30000'],['적용 용적률','200'],['적용 건폐율','50'],['계획 지상층수','4']]) await page.getByRole('spinbutton',{name:new RegExp(label)}).fill(value);
  await page.locator('summary').filter({hasText:'사업비와 차입조건'}).click();
  await page.getByLabel('사업비 입력 방식').selectOption('total');
  await page.getByRole('spinbutton', {name:'총사업비 (억원)',exact:true}).fill('2000');
  await page.getByRole('spinbutton', {name:/지연 중 평균 차입잔액/}).fill('1000');
  await page.locator('summary').filter({hasText:'금리·지연기간 가정'}).click();
  await page.getByRole('spinbutton',{name:/금리 가정 2/}).fill('6');
  await page.getByRole('spinbutton',{name:/지연 가정 2/}).fill('12');
}
export async function report(page: Page) {
  await page.getByRole('button', {name:'보고서 · PDF',exact:true}).click();
  await page.locator('.report-open-button').click();
  await expect(page.locator('#print-root [data-snapshot-id]')).toHaveCount(1);
}
export async function navigate(page: Page, name: string) {
  const menu=page.getByRole('button',{name:'메뉴 열기',exact:true});if(await menu.isVisible())await menu.click();
  await page.locator('.site-header').getByRole('link',{name,exact:true}).click();
}
export async function onlyLocal(page: Page) {
  await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:5208'?r.continue():r.abort());
}
