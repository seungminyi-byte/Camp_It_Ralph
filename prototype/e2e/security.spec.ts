import { test,expect } from '@playwright/test';
import { onlyLocal,pick,report } from './helpers';
import { restrictionFixture,prohibitedHit } from '../src/test/onlineFixtures';
test('R25 R40 invalid core bundle fails visibly and retry; hostile external names and links stay text',async({page})=>{
 await onlyLocal(page);let invalid=true;
 await page.route('**/data/constants.json',async r=>{if(invalid)return r.fulfill({json:{}});const response=await r.fetch();const data=await response.json();data.scoring.evidence.power.sourceUrl='javascript:alert(1)';return r.fulfill({json:data});});
 await page.route('**/api/restrictions?*',r=>{const u=new URL(r.request().url());return r.fulfill({json:{...restrictionFixture(Number(u.searchParams.get('lat')),Number(u.searchParams.get('lng'))),hits:[{...prohibitedHit,name:'<img src=x onerror=alert(1)> EXTERNAL_LITERAL'}]}});});
 await page.goto('/review');await expect(page.getByRole('alert')).toContainText('데이터를 불러오지 못했습니다');invalid=false;await page.getByRole('button',{name:'데이터 다시 불러오기'}).click();await pick(page);await report(page);await expect(page.locator('#print-root')).toContainText('<img src=x onerror=alert(1)> EXTERNAL_LITERAL');await expect(page.locator('#print-root img')).toHaveCount(0);await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);await expect(page.locator('#print-root')).toContainText('한국전력공사');
});
