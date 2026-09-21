import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pick, report, onlyLocal, navigate } from './helpers';
import { restrictionFixture, prohibitedHit } from '../src/test/onlineFixtures';
const state = (page:any,label:string)=>page.locator('.online-evidence-status>div').filter({hasText:`${label}:`});
async function query(page:any,q='36.4967, 127.3007'){await page.getByRole('combobox',{name:'부지 검색'}).fill(q);await page.getByRole('combobox',{name:'부지 검색'}).press('Enter');await page.locator('.result-overview').waitFor();}
test('R26-R28 strict wire errors, partial known hit, no-hit invalidation and retry',async({page})=>{
 await onlyLocal(page);let mode='invalid';
 await page.route('**/api/restrictions?*',async route=>{const u=new URL(route.request().url());const b=restrictionFixture(Number(u.searchParams.get('lat')),Number(u.searchParams.get('lng')));if(mode==='invalid')return route.fulfill({json:{}});if(mode==='wrongversion')return route.fulfill({json:{...b,version:'old'}});if(mode==='wrongcoords')return route.fulfill({json:{...b,coordinate:{lat:37,lng:127}}});if(mode==='partial')return route.fulfill({json:{...b,complete:false,failed:['LT_C_UM710'],hits:[prohibitedHit]}});if(mode==='error')return route.fulfill({status:502,body:'failure'});return route.fulfill({json:b});});
 await page.goto('/review');await pick(page);await expect(state(page,'규제구역')).toContainText('조회 실패 · 미확인');
 for(const next of ['wrongversion','wrongcoords']){mode=next;await page.getByRole('button',{name:'규제구역 다시 조회',exact:true}).click();await expect(state(page,'규제구역')).toContainText('조회 실패 · 미확인');}
 mode='partial';await page.getByRole('button',{name:'규제구역 다시 조회',exact:true}).click();await expect(state(page,'규제구역')).toContainText('일부 조회 미완료');await expect(page.locator('.result-overview')).toContainText('법적 입지 제한');await report(page);await expect(page.locator('#print-root')).toContainText('E등급 상한');await page.locator('.report-close-button').click();
 mode='normal';await page.getByRole('button',{name:'규제구역 다시 조회',exact:true}).click();await expect(state(page,'규제구역')).toContainText('조회 완료');
 mode='error';await page.getByRole('button',{name:'규제구역 다시 조회',exact:true}).click();await expect(state(page,'규제구역')).toContainText('조회 실패 · 미확인');await report(page);await expect(page.locator('#print-root .report-online-status').first().locator('li').nth(1)).toContainText('조회 미확인');
});
test('R26 15-second boundary and retry in integrated UI',async({page},info)=>{
 await onlyLocal(page);let release:(()=>void)|undefined;const pending=new Promise<void>(r=>release=r);let hang=true;
 await page.route('**/api/restrictions?*',async route=>{if(hang)await pending;await route.continue().catch(()=>{});});
 await page.goto('/review');const start=Date.now();await query(page);await expect(state(page,'규제구역')).toContainText('조회 중');await expect(state(page,'규제구역')).toContainText('조회 실패 · 미확인',{timeout:18000});const elapsed=Date.now()-start;expect(elapsed).toBeGreaterThanOrEqual(14900);expect(elapsed).toBeLessThan(18000);await info.attach('real-time-deadline',{body:JSON.stringify({elapsedMs:elapsed,kind:'request-to-error wall time'}),contentType:'application/json'});
 hang=false;release!();await page.getByRole('button',{name:'규제구역 다시 조회',exact:true}).click();await expect(state(page,'규제구역')).toContainText('조회 완료');
});
test('R27 slow A cannot overwrite B; route unmount cancels pending',async({page})=>{
 await onlyLocal(page);let release:(()=>void)|undefined;const pending=new Promise<void>(r=>release=r);let entered=0;
 await page.route('**/api/restrictions?*',async route=>{const u=new URL(route.request().url());const lat=Number(u.searchParams.get('lat'));const b=restrictionFixture(lat,Number(u.searchParams.get('lng')));if(lat===36.4967){entered++;await pending;await route.fulfill({json:{...b,hits:[{...prohibitedHit,name:'A_LATE_ONLY'}]}}).catch(()=>{});}else await route.fulfill({json:b});});
 await page.goto('/review');await query(page);await expect.poll(()=>entered).toBe(1);await query(page,'36.5067, 127.3007');await expect(state(page,'규제구역')).toContainText('조회 완료');release!();await page.waitForLoadState('networkidle');await expect(page.locator('.current-selection')).toContainText('36.50670');await expect(page.locator('.result-overview')).not.toContainText('A_LATE_ONLY');await navigate(page,'팀 소개');await expect(page.locator('.dc-workspace')).toHaveCount(0);
});
test('R28 nonselected pin expires after ten minutes and report reevaluates',async({page})=>{
 await onlyLocal(page);await page.clock.install({time:new Date()});await page.goto('/review');await pick(page);await page.locator('.panel-action button').first().click();await pick(page,'36.5067, 127.3007');await page.getByRole('button',{name:'담은 후보 1',exact:true}).click();const score=page.locator('dialog tr').filter({has:page.getByRole('rowheader',{name:'참고점수',exact:true})});await expect(score).toContainText('점');await page.keyboard.press('Escape');
 await page.route('**/api/*',r=>r.fulfill({status:502,body:'expiry fixture'}));await page.clock.fastForward(600_100);await page.getByRole('button',{name:'담은 후보 1',exact:true}).click();await expect(score).toContainText('미산정');await page.keyboard.press('Escape');await report(page);await expect(page.locator('#print-root .report-comparison-detail .report-online-status')).toContainText('이전 관찰 보존 · 재확인 필요');
});
test('R29-R31 AI empty, error, stop, unsafe claims, revisions and default report',async({page})=>{
 await onlyLocal(page);let mode='empty',release:(()=>void)|undefined;const pending=new Promise<void>(r=>release=r);const valid=readFileSync(new URL('./ai.txt',import.meta.url),'utf8');
 await page.route('**/api/generate',async route=>{if(mode==='hang'){await pending;return route.fulfill({body:valid}).catch(()=>{});}if(mode==='error')return route.fulfill({status:502,body:'failure'});return route.fulfill({contentType:'text/plain',body:mode==='empty'?'':mode==='unsafe'?valid.replace('추가 확인이 필요합니다.','전력 공급이 보장됩니다. 총사업비는 999999억원입니다. <img src=x onerror=alert(1)> [링크](javascript:alert(1))'):valid});});
 await page.goto('/review');await pick(page);await report(page);await expect(page.locator('#print-root .report-ai')).toHaveCount(0);
 const ai=page.locator('.report-ai-button');for(const next of ['empty','error']){mode=next;await ai.click();await expect(page.locator('.memo-panel [role=alert]')).toBeVisible();await expect(page.locator('.memo-panel input[type=checkbox]')).toHaveCount(0);}
 mode='hang';await ai.click();await expect(ai).toContainText('생성 중지');await ai.click();await expect(page.locator('.memo-panel')).toContainText('생성을 중단했습니다');release!();
 mode='unsafe';await ai.click();await expect(page.locator('.memo-panel')).toContainText('AI 부록 제외');await expect(page.locator('.memo-panel img')).toHaveCount(0);await expect(page.locator('.memo-panel a[href^="javascript:"]')).toHaveCount(0);await expect(page.locator('.memo-panel input[type=checkbox]')).toHaveCount(0);
 mode='valid';await ai.click();await expect(page.locator('.memo-panel input[type=checkbox]')).toHaveCount(1);await expect(page.locator('.memo-panel input[type=checkbox]')).not.toBeChecked();
 await page.getByRole('button',{name:/상세조건 입력/}).click();const land=page.getByRole('spinbutton',{name:/대지면적/});await land.fill('10000');await land.fill('');await page.getByRole('button',{name:'보고서 · PDF',exact:true}).click();await expect(page.locator('.memo-panel')).toContainText('이전 AI 의견을 해제');await expect(page.locator('.memo-panel input[type=checkbox]')).toHaveCount(0);
 await ai.click();await expect(page.locator('.memo-panel input[type=checkbox]')).toHaveCount(1);await page.getByRole('button',{name:'용도지역 다시 조회',exact:true}).click();await expect(page.locator('.memo-panel')).toContainText('이전 AI 의견을 해제');await expect(page.locator('.memo-panel input[type=checkbox]')).toHaveCount(0);
 await page.locator('.report-open-button').click();await expect(page.locator('#print-root .report-ai')).toHaveCount(0);await navigate(page,'팀 소개');await navigate(page,'부지 검토');await page.getByRole('button',{name:'보고서 · PDF',exact:true}).click();await expect(page.locator('.memo-panel')).not.toContainText('총사업비는 999999');
});
test('R29 AI 65-second integrated deadline using virtual browser clock',async({page})=>{
 await onlyLocal(page);await page.clock.install({time:new Date()});let count=0,release:(()=>void)|undefined;const pending=new Promise<void>(r=>release=r);await page.route('**/api/generate',async route=>{count++;await pending;await route.abort().catch(()=>{});});await page.goto('/review');await pick(page);await report(page);await page.locator('.report-ai-button').click();await expect.poll(()=>count).toBe(1);await page.clock.fastForward(65_100);await expect(page.locator('.memo-panel [role=alert]')).toContainText('65초');release!();await page.locator('.report-open-button').click();await expect(page.locator('#print-root')).toBeAttached();
});
