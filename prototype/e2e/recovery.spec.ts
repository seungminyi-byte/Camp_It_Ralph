import { test, expect } from '@playwright/test';
import { fixtures, onlyLocal, navigate, pick } from './helpers';
test('R26 production lazy chunk failure preserves shell and reload restores inputs',async({page})=>{
 await onlyLocal(page);await page.addInitScript(session=>{if(!sessionStorage.getItem('ralph.review.v1'))sessionStorage.setItem('ralph.review.v1',session);},fixtures.numeric.session);
 let fail=true,blocked=0;await page.route('**/assets/ReviewApp-*.js',route=>{if(fail){blocked++;return route.abort();}return route.continue();});
 await page.goto('/');await page.getByRole('link',{name:'부지 검토 시작',exact:false}).first().click();
 await expect(page.getByRole('heading',{name:'검토 화면을 불러오지 못했습니다'})).toBeVisible();expect(blocked).toBe(1);await expect(page.locator('.site-header')).toBeVisible();await expect(page.locator('main')).toBeVisible();
 fail=false;await page.getByRole('button',{name:'새로고침하여 다시 불러오기'}).click();await expect(page.locator('.result-overview')).toBeVisible();await expect(page.locator('.header-saved')).toContainText('2');await expect(page.locator('.review-decision')).toContainText('5,000㎡ 부족');
 await navigate(page,'팀 소개');await navigate(page,'부지 검토');await expect(page.locator('.header-saved')).toContainText('2');
});
test('R25 search empty, invalid/outside coordinates, then recovery and map click',async({page})=>{
 await onlyLocal(page);await page.goto('/review');await page.locator('.workspace-toolbar').waitFor();await page.getByRole('button',{name:'검색',exact:true}).click();await expect(page.locator('.result-overview')).toHaveCount(0);
 await page.getByRole('combobox',{name:'부지 검색'}).fill('99, 127');await page.getByRole('combobox',{name:'부지 검색'}).press('Enter');await expect(page.getByRole('status').filter({hasText:'자료 범위 밖 좌표'})).toBeVisible();
 await pick(page);const before=await page.locator('.current-selection').innerText();await page.locator('.leaflet-container').click({position:{x:350,y:220}});await expect(page.locator('.current-selection')).not.toHaveText(before);await page.getByRole('button',{name:'보고서 · PDF',exact:true}).click();await page.locator('.report-open-button').click();await expect(page.locator('#print-root .report-location')).toContainText('지도');
});
