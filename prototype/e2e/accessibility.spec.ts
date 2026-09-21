import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { pick, numeric, report, onlyLocal, fixtures } from './helpers';
for(const width of [390,768,1440])test(`R35 axe major states ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:width===390?844:1000});await onlyLocal(page);
 const audit=async(name:string)=>{await page.evaluate(()=>document.fonts.ready);const result=await new AxeBuilder({page}).analyze();await info.attach(`axe-${width}-${name}`,{body:JSON.stringify(result,null,2),contentType:'application/json'});expect.soft(result.violations.filter(v=>v.impact==='critical'||v.impact==='serious'),name).toEqual([]);expect.soft(await page.evaluate(()=>document.body.scrollWidth<=innerWidth),name+' horizontal').toBe(true);};
 for(const route of ['/','/project','/team']){await page.goto(route);await audit(route.replace('/','')||'home');await page.reload();await expect(page.locator('h1')).toHaveCount(1);}
 await page.goto('/review');await page.locator('.workspace-toolbar').waitFor();await audit('review-empty');await pick(page);await audit('review-result');await numeric(page);await audit('expanded-inputs');
 if(width<1024){expect(await page.locator('.map-column').isVisible()).toBe(false);await page.getByRole('button',{name:'지도 보기',exact:true}).click();await audit('map');await page.getByRole('button',{name:'검토 결과',exact:true}).click();}
 await report(page);await audit('report');await page.locator('.report-close-button').click();await expect(page.locator('.report-open-button')).toBeFocused();
 await page.evaluate(session=>sessionStorage.setItem('ralph.review.v1',session),fixtures.numeric.session);await page.reload();await page.locator('.result-overview').waitFor();await page.getByRole('button',{name:'담은 후보 2',exact:true}).click();await audit('compare');
});
