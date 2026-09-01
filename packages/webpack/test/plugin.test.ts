import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe,expect,it } from 'vitest';
import webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { SemanticAtomicCssWebpackPlugin } from '../src/plugin.js';
const entry=fileURLToPath(import.meta.url);
const cssUse={loader:'css-loader',options:{modules:{auto:/\.module\.(?:css|scss|less)$/,namedExport:false}}};
function config(plugins:any[],target:any='web'):webpack.Configuration{return{mode:'development',target,entry,module:{rules:[{test:/\.css$/,use:[MiniCssExtractPlugin.loader,cssUse]}]},plugins};}
describe('SemanticAtomicCssWebpackPlugin guards',()=>{
 it('build 缺少 HtmlWebpackPlugin 时 fail fast',()=>expect(()=>webpack(config([new MiniCssExtractPlugin(),new SemanticAtomicCssWebpackPlugin()]))).toThrow(/html-webpack-plugin/));
 it('拒绝 webworker、library 与 Module Federation',()=>{
  expect(()=>webpack(config([new HtmlWebpackPlugin(),new MiniCssExtractPlugin(),new SemanticAtomicCssWebpackPlugin()],'webworker'))).toThrow(/webpack\.target/);
  expect(()=>webpack({...config([new HtmlWebpackPlugin(),new MiniCssExtractPlugin(),new SemanticAtomicCssWebpackPlugin()]),output:{library:{name:'FixtureLibrary',type:'umd'}}})).toThrow(/webpack\.output\.library/);
  expect(()=>webpack({...config([new HtmlWebpackPlugin(),new MiniCssExtractPlugin(),new SemanticAtomicCssWebpackPlugin()]),entry:{main:{import:[entry],library:{name:'EntryLibrary',type:'umd'}}}})).toThrow(/webpack\.entry\.library/);
  expect(()=>webpack({...config([new HtmlWebpackPlugin(),new MiniCssExtractPlugin(),new SemanticAtomicCssWebpackPlugin()]),entry:async()=>({main:{import:[entry],library:{name:'DynamicLibrary',type:'umd'}}})} as webpack.Configuration)).toThrow(/webpack\.entry-function/);
  class ModuleFederationPlugin { apply(){} }
  expect(()=>webpack(config([new ModuleFederationPlugin(),new HtmlWebpackPlugin(),new MiniCssExtractPlugin(),new SemanticAtomicCssWebpackPlugin()]))).toThrow(/webpack\.module-federation/);
 });
 it('纯 dev 且关闭 overlay 时不要求 HtmlWebpackPlugin',()=>{
  expect(()=>webpack({
   ...config([new SemanticAtomicCssWebpackPlugin({devtools:{enabled:false}})]),
   module:{rules:[{test:/\.css$/,use:['style-loader',cssUse]}]},
   devServer:{}
  } as webpack.Configuration)).not.toThrow();
 });
 it('build 与 dev 都拒绝动态 auto publicPath',()=>{
  expect(()=>webpack({...config([new HtmlWebpackPlugin(),new MiniCssExtractPlugin(),new SemanticAtomicCssWebpackPlugin()]),output:{publicPath:'auto'}})).toThrow(/webpack\.output\.publicPath/);
  expect(()=>webpack({
   ...config([new HtmlWebpackPlugin(),new SemanticAtomicCssWebpackPlugin()]),
   output:{publicPath:'auto'},
   module:{rules:[{test:/\.css$/,use:['style-loader',cssUse]}]},
   devServer:{}
  } as webpack.Configuration)).toThrow(/webpack\.output\.publicPath/);
 });
 it('把 source-map devtool 继承状态传给目标 css-loader 保护',()=>{
  const plugins=[new HtmlWebpackPlugin(),new MiniCssExtractPlugin(),new SemanticAtomicCssWebpackPlugin()];
  expect(()=>webpack({...config(plugins),devtool:'source-map'})).toThrow(/webpack\.css-source-map/);
  expect(()=>webpack({...config([new HtmlWebpackPlugin(),new MiniCssExtractPlugin(),new SemanticAtomicCssWebpackPlugin()]),devtool:[{type:'css',use:'source-map'}]} as webpack.Configuration)).toThrow(/webpack\.css-source-map/);
  const disabledCss={loader:'css-loader',options:{modules:{auto:/\.module\.(?:css|scss|less)$/,namedExport:false},sourceMap:false}};
  expect(()=>webpack({...config([new HtmlWebpackPlugin(),new MiniCssExtractPlugin(),new SemanticAtomicCssWebpackPlugin()]),devtool:'source-map',module:{rules:[{test:/\.css$/,use:[MiniCssExtractPlugin.loader,disabledCss]}]}})).not.toThrow();
 });
 it('失败 compilation 保留 last-good snapshot，后续成功空编译清空旧状态',async()=>{
  const output=await mkdtemp(path.join(os.tmpdir(),'gss-webpack-error-'));
  const entryPath=path.join(output,'entry.js');
  await writeFile(entryPath,'export {};');
  const control={fail:false,stageMetadata:true};
  const plugin=new SemanticAtomicCssWebpackPlugin({devtools:{enabled:true,overlay:false}});
  const lifecyclePlugin={apply(compiler:webpack.Compiler){compiler.hooks.thisCompilation.tap('lifecycle-test',(compilation)=>{
   compilation.hooks.processAssets.tap({name:'lifecycle-test-metadata',stage:webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS-1},()=>{
    if(!control.stageMetadata)return;
    const metadata=JSON.stringify({schemaVersion:2,owner:'/virtual/State.module.css',inputs:[{id:'/virtual/State.module.css',scopedCss:'',exportedClassNames:[],preserveClassNames:{}}],atomicClassByKey:{}});
    compilation.emitAsset('__semantic_atomic_css_metadata__/test.json',new webpack.sources.RawSource(metadata));
   });
   compilation.hooks.processAssets.tap({name:'lifecycle-test-error',stage:webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT},()=>{if(control.fail)compilation.errors.push(new Error('late failure'));});
  });}};
  const compiler=webpack({mode:'development',target:'web',entry:entryPath,output:{path:output},module:{rules:[{test:/\.css$/,use:['style-loader',cssUse]}]},plugins:[plugin,lifecyclePlugin],devServer:{}} as webpack.Configuration);
  let middleware:any;
  (compiler.options as any).devServer.setupMiddlewares([], {app:{use(value:any){middleware=value;}}});
  const readReport=()=>{let body='';middleware({method:'GET',url:'/__semantic-atomic-css/report'},{status(){return this;},set(){return this;},send(value:string){body=value;}},(error?:unknown)=>{if(error)throw error;});return JSON.parse(body);};
  const run=()=>new Promise<void>((resolve,reject)=>compiler.run((error,stats)=>error?reject(error):!control.fail&&stats?.hasErrors()?reject(new Error(stats.toString({all:false,errors:true,errorDetails:true}))):resolve()));
  await run();
  expect(readReport()).toMatchObject({status:'ready',environments:[{name:'web'}]});
  control.stageMetadata=false;
  control.fail=true;
  await run();
  expect(readReport()).toMatchObject({status:'error',error:'webpack-compilation-failed',environments:[{name:'web'}]});
  control.fail=false;
  await run();
  expect(readReport()).toMatchObject({status:'idle',environments:[]});
  await new Promise<void>((resolve,reject)=>compiler.close((error)=>error?reject(error):resolve()));
  await rm(output,{recursive:true,force:true});
 });
 it('自定义 resolveLoader 无法同步证明 bare request 时 fail fast',()=>{
  expect(()=>webpack({
   ...config([new HtmlWebpackPlugin(),new MiniCssExtractPlugin(),new SemanticAtomicCssWebpackPlugin()]),
   resolveLoader:{alias:{'css-loader':cssUse.loader}}
  })).toThrow(/webpack\.resolve-loader/);
 });
 it('校验 rule 实际选择的绝对/query loader package 版本',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'gss-webpack-peer-'));
  const loader=path.join(root,'node_modules/css-loader/dist/cjs.js');
  await mkdir(path.dirname(loader),{recursive:true});
  await writeFile(loader,'module.exports = function(source) { return source; };');
  await writeFile(path.join(root,'node_modules/css-loader/package.json'),JSON.stringify({name:'css-loader',version:'6.0.0'}));
  expect(()=>webpack({
   ...config([new HtmlWebpackPlugin(),new MiniCssExtractPlugin(),new SemanticAtomicCssWebpackPlugin()]),
   module:{rules:[{test:/\.css$/,use:[MiniCssExtractPlugin.loader,{loader:`${loader}?fixture=1`,options:{modules:{auto:/\.module\.(?:css|scss|less)$/,namedExport:false}}}]}]}
  })).toThrow(/webpack\.peer\.css-loader/);
  const foreign=path.join(root,'node_modules/css-loader/node_modules/foreign/dist/loader.js');
  await mkdir(path.dirname(foreign),{recursive:true});
  await writeFile(foreign,'module.exports = function(source) { return source; };');
  await writeFile(path.join(root,'node_modules/css-loader/node_modules/foreign/package.json'),JSON.stringify({name:'foreign',version:'7.1.0'}));
  expect(()=>webpack({
   ...config([new HtmlWebpackPlugin(),new MiniCssExtractPlugin(),new SemanticAtomicCssWebpackPlugin()]),
   module:{rules:[{test:/\.css$/,use:[MiniCssExtractPlugin.loader,{loader:foreign,options:{modules:{auto:/\.module\.(?:css|scss|less)$/,namedExport:false}}}]}]}
  })).toThrow(/实际 loader package 为 foreign/);
  await rm(root,{recursive:true,force:true});
 });
 it('同一 plugin 实例的 build/dev mode 与 dev report 按 compiler 隔离',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'gss-webpack-multi-'));
  const entryPath=path.join(root,'entry.js');
  await writeFile(entryPath,'export {};');
  const shared=new SemanticAtomicCssWebpackPlugin({devtools:{enabled:true,overlay:false}});
  const emitAtomic={apply(compiler:webpack.Compiler){compiler.hooks.thisCompilation.tap('emit-atomic',(compilation)=>{
   compilation.hooks.processAssets.tap({name:'emit-atomic',stage:webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS},()=>compilation.emitAsset('static/css/semantic-atomic.css',new webpack.sources.RawSource('.x{}')));
  });}};
  const buildOutput=path.join(root,'build');
  const buildCompiler=webpack({mode:'development',target:'web',entry:entryPath,output:{path:buildOutput},module:{rules:[{test:/\.css$/,use:[MiniCssExtractPlugin.loader,cssUse]}]},plugins:[new HtmlWebpackPlugin(),new MiniCssExtractPlugin(),shared,emitAtomic],devServer:{}} as webpack.Configuration);
  const failControl={fail:true};
  const lateFailure={apply(compiler:webpack.Compiler){compiler.hooks.thisCompilation.tap('isolated-failure',(compilation)=>compilation.hooks.processAssets.tap({name:'isolated-failure',stage:webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT},()=>{if(failControl.fail)compilation.errors.push(new Error('isolated'));}));}};
  const devCompiler=webpack({mode:'development',target:'web',entry:entryPath,output:{path:path.join(root,'dev')},module:{rules:[{test:/\.css$/,use:['style-loader',cssUse]}]},plugins:[shared,lateFailure],devServer:{}} as webpack.Configuration);
  let buildMiddleware:any;let devMiddleware:any;
  (buildCompiler.options as any).devServer.setupMiddlewares([], {app:{use(value:any){buildMiddleware=value;}}});
  (devCompiler.options as any).devServer.setupMiddlewares([], {app:{use(value:any){devMiddleware=value;}}});
  const report=(middleware:any)=>{let body='';middleware({method:'GET',url:'/__semantic-atomic-css/report'},{status(){return this;},set(){return this;},send(value:string){body=value;}},()=>{});return JSON.parse(body);};
  await new Promise<void>((resolve,reject)=>devCompiler.run((error)=>error?reject(error):resolve()));
  expect(report(devMiddleware)).toMatchObject({status:'error'});
  expect(report(buildMiddleware)).toMatchObject({status:'idle'});
  await new Promise<void>((resolve,reject)=>buildCompiler.run((error)=>error?reject(error):resolve()));
  expect(await readFile(path.join(buildOutput,'index.html'),'utf8')).toContain('static/css/semantic-atomic.css');
  expect(report(devMiddleware)).toMatchObject({status:'error'});
  await Promise.all([buildCompiler,devCompiler].map((compiler)=>new Promise<void>((resolve,reject)=>compiler.close((error)=>error?reject(error):resolve()))));
  await rm(root,{recursive:true,force:true});
 });
});
