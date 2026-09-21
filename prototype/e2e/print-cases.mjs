import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const dir = resolve(import.meta.dirname, './artifacts/pdf'); mkdirSync(dir, {recursive:true});
const fixtures = JSON.parse(readFileSync(resolve(import.meta.dirname,'fixtures.json'),'utf8'));
const browser = await chromium.launch({headless:true});
const results = [];
try {
 for (const [name, fixture] of Object.entries(fixtures)) {
  const context = await browser.newContext({viewport:{width:1440,height:1000},locale:'ko-KR'});
  await context.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5208' ? route.continue() : route.abort());
  await context.addInitScript(session => sessionStorage.setItem('ralph.review.v1',session), fixture.session);
  const page = await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const at=performance.now(); await page.goto(`http://127.0.0.1:5208/review?fixture=${name}`); await page.locator('.result-overview').waitFor();
  await page.waitForLoadState('networkidle');
  await page.locator('.report-section > summary').click();
  if (name === 'ai') { await page.locator('.report-ai-button').click(); await page.locator('.memo-panel input[type=checkbox]').waitFor(); }
  const open=performance.now(); await page.locator('.report-open-button').click(); await page.locator('#print-root .business-report').waitFor({state:'attached'});
  await page.evaluate(()=>document.fonts.ready);
  const openMs=performance.now()-open;
  const baseAi=await page.locator('#print-root .report-ai').count();
  if(name==='ai') { if(baseAi!==0) throw Error('AI default must be off'); await page.locator('.memo-panel input[type=checkbox]').check(); await page.locator('.report-open-button').click(); }
  const text=await page.locator('#print-root').textContent();
  const tables=await page.locator('#print-root .sensitivity-table').evaluateAll(tables=>tables.map(table=>Array.from(table.rows,row=>Array.from(row.cells,cell=>cell.textContent))));
  const first=await page.locator('#print-root .report-first-page').textContent();
  const snap=await page.locator('#print-root article').first().getAttribute('data-snapshot-id');
  await page.pdf({path:resolve(dir,`${name}.pdf`),format:'A4',printBackground:true,preferCSSPageSize:true});
  writeFileSync(resolve(dir,`${name}.txt`),text);
  results.push({name,elapsedMs:performance.now()-at,openMs,snapshotId:snap,pins:await page.locator('#print-root .report-comparison tbody tr').count(),ai:await page.locator('#print-root .report-ai').count(),first,tables,errors});
  await context.close();
 }
} finally { await browser.close(); writeFileSync(resolve(dir,'manifest.json'),JSON.stringify(results,null,2)); }
console.log(JSON.stringify(results.map(({name,openMs,pins,ai,errors})=>({name,openMs,pins,ai,errors})),null,2));
