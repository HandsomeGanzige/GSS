import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVisualProcessTracker, waitForFixtureUrl } from './visual-processes.mjs';
import { chromium } from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'gss-webpack-visual-'));
const directCssPath=path.join(root,'suites/base/src/Base.module.css');
const partialPath=path.join(root,'suites/preprocessor/src/_tokens.scss');
const preprocessorEntryPath=path.join(root,'suites/preprocessor/src/main.js');
const directCssOriginal=await fs.readFile(directCssPath,'utf8');
const partialOriginal=await fs.readFile(partialPath,'utf8');
const preprocessorEntryOriginal=await fs.readFile(preprocessorEntryPath,'utf8');
const servers=new Set();
const readinessTimeoutMs=30_000;
const {startNode,terminateAll}=createVisualProcessTracker(root);
const executablePath=process.env.GSS_VISUAL_CHROME_EXECUTABLE;
try{
 const [semanticDev,nativeDev,semanticPre,nativePre]=await Promise.all([
  startDev('base','semantic'),startDev('base','native'),startDev('preprocessor','semantic'),startDev('preprocessor','native')
 ]);
 await Promise.all([semanticDev,nativeDev,semanticPre,nativePre].map(({url,child})=>waitUrl(url,child)));
 const devReport=await fetch(`${semanticDev.url}/__semantic-atomic-css/report`).then((response)=>response.json());
 if(devReport.adapter!=='webpack')throw new Error('Webpack dev report adapter mismatch');
 const semanticOut=path.join(temp,'semantic');const nativeOut=path.join(temp,'native');
 await runBuild('semantic',semanticOut);await runBuild('native',nativeOut);
 const semanticPreview=await serve(semanticOut);const nativePreview=await serve(nativeOut);
 servers.add(semanticPreview.server);servers.add(nativePreview.server);
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 try{
  for(const [label,left,right] of [['dev',semanticDev.url,nativeDev.url],['preview',semanticPreview.url,nativePreview.url]]){
   for(const width of [1280,760]){
    const a=await browser.newPage({viewport:{width,height:900}});const b=await browser.newPage({viewport:{width,height:900}});
    await Promise.all([a.goto(left),b.goto(right)]);await Promise.all([a.waitForSelector('#shell'),b.waitForSelector('#shell')]);
    const [semantic,native]=await Promise.all([snapshot(a),snapshot(b)]);
    if(JSON.stringify(semantic.styles)!==JSON.stringify(native.styles))throw new Error(`${label}/${width}: computed style mismatch\n${JSON.stringify({semantic:semantic.styles,native:native.styles},null,2)}`);
    for(const [key,value] of Object.entries(native.tokens)){const enhanced=semantic.tokens[key];if(typeof enhanced==='string'&&!enhanced.startsWith(String(value)))throw new Error(`${label}/${width}: token ${key} does not preserve native prefix`);}
    if(label==='dev'&&await a.locator('style[data-semantic-atomic-css-webpack-dev]').count()!==1)throw new Error('dev shared owner count is not one');
    await a.close();await b.close();
   }
  }
  const semanticPage=await browser.newPage();const nativePage=await browser.newPage();
  await Promise.all([semanticPage.goto(semanticDev.url),nativePage.goto(nativeDev.url)]);
  await fs.writeFile(directCssPath,directCssOriginal.replace('padding: 16px;','padding: 19px;'));
  await Promise.all([waitStyle(semanticPage,'#shell','paddingTop','19px'),waitStyle(nativePage,'#shell','paddingTop','19px')]);
  if(await semanticPage.locator('style[data-semantic-atomic-css-webpack-dev]').count()!==1)throw new Error('HMR created duplicate shared owner');
  await fs.writeFile(directCssPath,directCssOriginal);
  await Promise.all([waitStyle(semanticPage,'#shell','paddingTop','16px'),waitStyle(nativePage,'#shell','paddingTop','16px')]);
  await semanticPage.close();await nativePage.close();
  const semanticPartial=await browser.newPage();const nativePartial=await browser.newPage();
  await Promise.all([semanticPartial.goto(semanticPre.url),nativePartial.goto(nativePre.url)]);
  await fs.writeFile(partialPath,partialOriginal.replace('$partial-padding: 14px;','$partial-padding: 18px;'));
  await Promise.all([waitStyle(semanticPartial,'#scss-safe','paddingTop','21px'),waitStyle(nativePartial,'#scss-safe','paddingTop','21px')]);
  await fs.writeFile(partialPath,partialOriginal);
  await Promise.all([waitStyle(semanticPartial,'#scss-safe','paddingTop','17px'),waitStyle(nativePartial,'#scss-safe','paddingTop','17px')]);
  const withoutLess=preprocessorEntryOriginal
    .replace("import lessStyles from './Panel.module.less';\n",'')
    .replace('const tokens = { baseStyles, sassStyles, lessStyles };','const tokens = { baseStyles, sassStyles };')
    .replace('    <section id="less-safe" class="${lessStyles.panel}">Less safe <span id="less-child" class="${lessStyles.child}">child</span></section>\n','');
  await fs.writeFile(preprocessorEntryPath,withoutLess);
  await Promise.all([waitMissing(semanticPartial,'#less-safe'),waitMissing(nativePartial,'#less-safe')]);
  await semanticPartial.waitForFunction(()=>!document.querySelector('style[data-semantic-atomic-css-webpack-dev]')?.textContent?.includes('border-radius: 9px'),undefined,{timeout:20000});
  await fs.writeFile(preprocessorEntryPath,preprocessorEntryOriginal);
  await Promise.all([semanticPartial.waitForSelector('#less-safe'),nativePartial.waitForSelector('#less-safe')]);
  await semanticPartial.close();await nativePartial.close();
 }finally{await browser.close();}
 console.log('Webpack visual parity passed: semantic/native dev+preview, desktop/narrow, tokens, shared owner, direct-module/Sass-partial HMR and removed import cleanup.');
}finally{
 await fs.writeFile(directCssPath,directCssOriginal);await fs.writeFile(partialPath,partialOriginal);await fs.writeFile(preprocessorEntryPath,preprocessorEntryOriginal);
 await terminateAll();
 await Promise.all([...servers].map((server)=>new Promise((resolve)=>server.close(resolve))));
 await fs.rm(temp,{recursive:true,force:true});
}
async function startDev(suite,mode){const child=startNode(['scripts/run-webpack.mjs','dev','--suite',suite,'--mode',mode],{GSS_FIXTURE_PORT:'0'});const url=await waitForFixtureUrl(child,`${suite}/${mode}`,readinessTimeoutMs);return{child,url};}
async function runBuild(mode,out){await new Promise((resolve,reject)=>{const child=startNode(['scripts/run-webpack.mjs','build','--suite','base','--mode',mode],{GSS_FIXTURE_OUT_DIR:out});let error='';child.stderr.on('data',d=>error+=d);child.on('exit',code=>code===0?resolve():reject(new Error(error)));});}
async function waitUrl(url,child){const deadline=Date.now()+readinessTimeoutMs;while(Date.now()<deadline){if(child?.exitCode!==null)throw new Error(`dev server exited before responding: ${url}`);const remaining=Math.max(1,deadline-Date.now());try{const response=await fetch(url,{signal:AbortSignal.timeout(remaining)});if(response.ok)return;}catch{}const delay=Math.min(250,Math.max(0,deadline-Date.now()));if(delay)await new Promise(r=>setTimeout(r,delay));}throw new Error(`dev server response timed out after ${readinessTimeoutMs}ms: ${url}`);}
async function waitStyle(page,selector,property,value){await page.waitForFunction(({selector,property,value})=>getComputedStyle(document.querySelector(selector))[property]===value,{selector,property,value},{timeout:20000});}
async function waitMissing(page,selector){await page.waitForFunction((selector)=>!document.querySelector(selector),selector,{timeout:20000});}
async function snapshot(page){return page.evaluate(()=>{const props=['color','backgroundColor','fontSize','fontWeight','paddingTop','borderTopColor','display','alignItems'];const styles={};for(const id of ['shell','asset-button','cascade-box','important-box','dashed-token','selector-list-cascade','attribute-presence']){const node=document.getElementById(id);if(!node)continue;const computed=getComputedStyle(node);styles[id]=Object.fromEntries(props.map(prop=>[prop,computed[prop]]));}return{styles,tokens:globalThis.__GSS_FIXTURE_TOKENS__??{}};});}
async function serve(rootDir){const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://x').pathname;const target=path.join(rootDir,pathname==='/'?'index.html':pathname);const body=await fs.readFile(target);res.statusCode=200;res.end(body);}catch{res.statusCode=404;res.end('not found');}});await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('preview server did not expose a TCP address');return{server,url:`http://127.0.0.1:${address.port}`};}
