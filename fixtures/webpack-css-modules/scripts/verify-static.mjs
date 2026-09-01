import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createVisualProcessTracker, waitForFixtureUrl } from './visual-processes.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'gss-webpack-fixture-'));
async function run(suite,mode,out,extra={}){await command(['scripts/run-webpack.mjs','build','--suite',suite,'--mode',mode],{GSS_FIXTURE_OUT_DIR:out,...extra});}
async function command(args,env={}){await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,...env},stdio:'pipe'});let text='';child.stdout.on('data',d=>text+=d);child.stderr.on('data',d=>text+=d);child.on('exit',code=>code===0?resolve():reject(new Error(text)));});}
try{
 for(const suite of ['base','preprocessor']){
  const semantic=path.join(temp,suite,'semantic');const native=path.join(temp,suite,'native');
  await run(suite,'semantic',semantic);await run(suite,'native',native);
  const html=await fs.readFile(path.join(semantic,'index.html'),'utf8');
  const atomic='static/css/semantic-atomic.css';const css=await fs.readFile(path.join(semantic,atomic),'utf8');
  if(!css.includes('._selector_'))throw new Error(`${suite}: atomic CSS missing`);
  if(html.indexOf(`/${atomic}`)<0||html.indexOf(`/${atomic}`)>html.indexOf('/static/css/native.css'))throw new Error(`${suite}: atomic link order`);
  if((await list(semantic)).some(name=>name.includes('__semantic_atomic_css_metadata__')))throw new Error(`${suite}: internal metadata leaked`);
  const firstDigest=await digestTree(semantic);
  await fs.rm(semantic,{recursive:true,force:true});
  const statsFile=path.join(temp,`${suite}-cached-stats.json`);
  await run(suite,'semantic',semantic,{GSS_FIXTURE_STATS_FILE:statsFile});
  if(firstDigest!==await digestTree(semantic))throw new Error(`${suite}: cached build is unstable`);
  const cachedStats=JSON.parse(await fs.readFile(statsFile,'utf8'));
  if(countCachedModules(cachedStats.modules??[])===0)throw new Error(`${suite}: second process did not hit filesystem module cache`);
  if(suite==='preprocessor'){
   for(const name of ['semantic-atomic-manifest.json','semantic-atomic-report.json'])await fs.access(path.join(semantic,name));
  }
 }
 const inlineOut=path.join(temp,'asset-matrix','inline');
 await run('base','semantic',inlineOut,{GSS_FIXTURE_INLINE_ASSETS:'true'});
 const inlineCss=await fs.readFile(path.join(inlineOut,'static/css/native.css'),'utf8');
 if(!inlineCss.includes('data:image/svg+xml'))throw new Error('inline asset was not preserved through native css-loader pipeline');
 if((await list(inlineOut)).some((name)=>name.endsWith('.svg')&&name!=='public-fixture-mark.svg'))throw new Error('inline source asset was unexpectedly emitted');
 const prefixOut=path.join(temp,'asset-matrix','prefix');
 await run('base','semantic',prefixOut,{GSS_FIXTURE_PUBLIC_PATH:'/cdn/'});
 const prefixHtml=await fs.readFile(path.join(prefixOut,'index.html'),'utf8');
 if(!prefixHtml.includes('/cdn/static/css/semantic-atomic.css'))throw new Error('static publicPath was not applied to atomic link');
 const relativeSemantic=path.join(temp,'asset-matrix','relative-semantic');
 const relativeNative=path.join(temp,'asset-matrix','relative-native');
 await run('base','semantic',relativeSemantic,{GSS_FIXTURE_PUBLIC_PATH:'cdn/'});
 await run('base','native',relativeNative,{GSS_FIXTURE_PUBLIC_PATH:'cdn/'});
 const relativeSemanticCss=await fs.readFile(path.join(relativeSemantic,'static/css/native.css'),'utf8');
 const relativeNativeCss=await fs.readFile(path.join(relativeNative,'static/css/native.css'),'utf8');
 const semanticUrls=assetUrls(relativeSemanticCss).filter((url)=>url.startsWith('cdn/'));
 const nativeUrls=assetUrls(relativeNativeCss).filter((url)=>url.startsWith('cdn/'));
 if(semanticUrls.length===0||JSON.stringify(semanticUrls)!==JSON.stringify(nativeUrls))throw new Error(`relative publicPath asset URL mismatch: ${JSON.stringify({semanticUrls,nativeUrls})}`);
 if(relativeSemanticCss.includes('url(/cdn/'))throw new Error('relative publicPath was incorrectly converted to a root URL');
 await verifyPublicPathAssets('parent-relative','../cdn/');
 await verifyPublicPathAssets('protocol-relative','//cdn.example.com/assets/');
 await verifyPublicPathAssets('absolute-cdn','https://cdn.example.com/assets/');
 await verifyPublicPathAssets('marker-root','/__semantic_atomic_css_relative_base__/');
 await verifyVisualProcessLifecycle();
 console.log('Webpack fixture static verification passed (base/preprocessor, native/semantic, filesystem-cache replay, inline/external/root/relative/CDN publicPath assets).');
}finally{await fs.rm(temp,{recursive:true,force:true});}
async function list(dir,prefix=''){const out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const name=path.posix.join(prefix,e.name);if(e.isDirectory())out.push(...await list(path.join(dir,e.name),name));else out.push(name);}return out.sort();}
function countCachedModules(modules){return modules.reduce((count,module)=>count+(module.cached?1:0)+countCachedModules(module.modules??[]),0);}
async function verifyPublicPathAssets(label,publicPath){
 const semantic=path.join(temp,'asset-matrix',`${label}-semantic`);const native=path.join(temp,'asset-matrix',`${label}-native`);
 await run('base','semantic',semantic,{GSS_FIXTURE_PUBLIC_PATH:publicPath});await run('base','native',native,{GSS_FIXTURE_PUBLIC_PATH:publicPath});
 const semanticCss=await fs.readFile(path.join(semantic,'static/css/native.css'),'utf8');const nativeCss=await fs.readFile(path.join(native,'static/css/native.css'),'utf8');
 const semanticUrls=assetUrls(semanticCss);const nativeUrls=assetUrls(nativeCss);
 if(semanticUrls.length===0||JSON.stringify(semanticUrls)!==JSON.stringify(nativeUrls))throw new Error(`${label} publicPath asset URL mismatch: ${JSON.stringify({semanticUrls,nativeUrls})}`);
}
async function verifyVisualProcessLifecycle(){
 const partial=createVisualProcessTracker(root);
 const ready=partial.startNode(['-e',"console.log('GSS_FIXTURE_URL=http://127.0.0.1:54321');setInterval(()=>{},1000)"]);
 const failed=partial.startNode(['-e','process.exit(7)']);
 try{await Promise.all([waitForFixtureUrl(ready,'probe/ready',1_000),waitForFixtureUrl(failed,'probe/failed',1_000)]);throw new Error('partial startup probe unexpectedly passed');}
 catch(error){if(!String(error).includes('probe/failed dev readiness exited (7)'))throw error;}
 finally{await partial.terminateAll();}
 if(ready.exitCode===null&&ready.signalCode===null)throw new Error('partial startup cleanup left a child running');
 const timeout=createVisualProcessTracker(root);const silent=timeout.startNode(['-e','setInterval(()=>{},1000)']);
 try{await waitForFixtureUrl(silent,'probe/timeout',50);throw new Error('readiness timeout probe unexpectedly passed');}
 catch(error){if(!String(error).includes('probe/timeout dev readiness timed out after 50ms'))throw error;}
 finally{await timeout.terminateAll();}
}
function assetUrls(css){return [...css.matchAll(/url\((?:"([^"]+)"|'([^']+)'|([^)'"\s]+))\)/g)].map((match)=>match[1]??match[2]??match[3]).sort();}
async function digestTree(dir){const names=(await list(dir)).filter(n=>!n.endsWith('.map'));const crypto=await import('node:crypto');const hash=crypto.createHash('sha256');for(const n of names){hash.update(n);hash.update(await fs.readFile(path.join(dir,n)));}return hash.digest('hex');}
