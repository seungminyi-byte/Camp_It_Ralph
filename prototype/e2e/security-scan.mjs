// Scan project sources and built assets only. Never read .env, credentials, or user profiles.
// Results contain file/rule/count metadata, never matched values.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const tracked = execFileSync('git', ['ls-files', '-z', 'src', 'api', 'scripts', 'public', '*.json', '*.ts', '*.html'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
function walk(dir) { return readdirSync(dir).flatMap(name => { const p = resolve(dir, name); return statSync(p).isDirectory() ? walk(p) : [p]; }); }
const built = walk(resolve(root, 'dist'));
const files = [...new Set([...tracked.map(p => resolve(root,p)),resolve(root,'src/site/ReviewErrorBoundary.tsx'),...built])].filter(p => ['.ts','.tsx','.js','.mjs','.cjs','.json','.html','.css','.txt'].includes(extname(p)));
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['service-token', /\bsk-(?:proj-|or-v1-)[A-Za-z0-9_-]{20,}/g],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{30,}/g],
  ['aws-key', /\bAKIA[A-Z0-9]{16}\b/g],
];
const findings = [];
for (const file of files) {
  const text = readFileSync(file,'utf8');
  for(const [rule,pattern] of patterns) { const count=[...text.matchAll(pattern)].length; if(count)findings.push({file:relative(root,file),rule,count}); }
}
const runtimeFixtureFindings=[];
for(const file of built.filter(p=>['.js','.html'].includes(extname(p)))) {
  const text=readFileSync(file,'utf8');
  for(const marker of ['HERITAGE_DIRECT_END','LATE_RESPONSE_END','EXTERNAL_LITERAL','/e2e/','fixture='])if(text.includes(marker))runtimeFixtureFindings.push({file:relative(root,file),marker});
}
const result={at:new Date().toISOString(),scope:'tracked prototype sources/API/scripts/public/config and production dist; excludes environment and credential files',scannedFiles:files.length,builtFiles:built.length,potentialHardcodedSecrets:findings,runtimeFixtureFindings,pass:findings.length===0&&runtimeFixtureFindings.length===0,limitation:'Pattern scan detects selected token formats; it is not proof that every possible secret format is absent.'};
mkdirSync(resolve(root,'e2e/artifacts'),{recursive:true});writeFileSync(resolve(root,'e2e/artifacts/security-scan.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1;
