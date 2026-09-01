import path from 'node:path';
import { describe,expect,it } from 'vitest';
import { installBridgeLoader } from '../src/ruleWalker.js';
import { resolveOptions } from '../src/options.js';
const modulesAuto=/\.module\.(?:css|scss|less)$/;
const css={loader:'/x/node_modules/css-loader/dist/cjs.js',options:{modules:{auto:modulesAuto,namedExport:false}}};
describe('Webpack static rules',()=>{
 it('递归 oneOf 并把 bridge 放在 owner 与 css-loader 之间',()=>{const rules:any[]=[{oneOf:[{test:/\.css$/,use:['/x/node_modules/mini-css-extract-plugin/dist/loader.js',css]}]}];const result=installBridgeLoader(rules,'/bridge.js','/runtime.js','/p',resolveOptions());expect(result.installed).toBe(1);expect(rules[0].oneOf[0].use.map((x:any)=>typeof x==='string'?x:x.loader)).toEqual(['/x/node_modules/mini-css-extract-plugin/dist/loader.js','/bridge.js','/x/node_modules/css-loader/dist/cjs.js']);});
 it('普通 modules:false rule 完整旁路，只安装显式 CSS Modules rule',()=>{
  const ordinary={loader:'/x/node_modules/css-loader/dist/cjs.js',options:{modules:false,sourceMap:true}};
  const rules:any[]=[
   {test:/\.css$/,exclude:/\.module\.css$/,use:['style-loader',ordinary]},
   {test:/\.module\.css$/,use:['style-loader',{...css,options:{modules:{auto:modulesAuto,namedExport:false},sourceMap:false}}]}
  ];
  const result=installBridgeLoader(rules,'/bridge.js','/runtime.js','/p',resolveOptions(),true);
  expect(result.installed).toBe(1);
  expect(result.loaderRequests).toEqual([
   {packageName:'css-loader',request:'/x/node_modules/css-loader/dist/cjs.js'},
   {packageName:'style-loader',request:'style-loader'}
  ]);
  expect(rules[0].use).toEqual(['style-loader',ordinary]);
  expect(rules[1].use.map((item:any)=>typeof item==='string'?item:item.loader)).toEqual(['style-loader','/bridge.js','/x/node_modules/css-loader/dist/cjs.js']);
 });
 it('以 compiler.context 和绝对字符串 condition 识别 pipeline，未知 RegExp 证据 fail fast',()=>{
  const root=path.resolve('/workspace/project');
  const included:any[]=[{test:/\.css$/,include:path.join(root,'src'),use:['style-loader',css]}];
  expect(installBridgeLoader(included,'/b','/r',root,resolveOptions()).installed).toBe(1);
  const escapedSrc=path.join(root,'src').replace(/[\\^$.*+?()[\]{}|]/g,'\\$&');
  const regexpIncluded:any[]=[{test:/\.css$/,include:[new RegExp(`^${escapedSrc}`)],use:['style-loader',css]}];
  expect(installBridgeLoader(regexpIncluded,'/b','/r',root,resolveOptions()).installed).toBe(1);
  const excluded:any[]=[
   {test:/\.css$/,include:root,exclude:root,use:['style-loader',{loader:'css-loader',options:{modules:false}}]},
   {test:/\.module\.css$/,include:path.join(root,'src'),use:['style-loader',css]}
  ];
  expect(installBridgeLoader(excluded,'/b','/r',root,resolveOptions()).installed).toBe(1);
  expect(()=>installBridgeLoader([
   {test:/\.css$/,include:/\/only-arbitrary-components\//,use:['style-loader',css]}
  ] as any,'/b','/r',root,resolveOptions())).toThrow(/webpack\.rule-condition-evidence/);
  expect(()=>installBridgeLoader([
   {test:/\.css$/,resource:/\/src\//,include:/\/external\//,use:['style-loader',css]}
  ] as any,'/b','/r',root,resolveOptions())).toThrow(/webpack\.rule-condition-evidence/);
 });
 it('modules:false broad pipeline 参与 overlap 检测，oneOf 互斥分支仍允许',()=>{
  const ordinary={loader:'css-loader',options:{modules:false}};
  expect(()=>installBridgeLoader([
   {test:/\.css$/,use:['style-loader',ordinary]},
   {test:/\.module\.css$/,use:['style-loader',css]}
  ] as any,'/b','/r','/p',resolveOptions())).toThrow(/webpack\.overlapping-css-pipelines/);
  expect(installBridgeLoader([{oneOf:[
   {test:/\.module\.css$/,use:['style-loader',css]},
   {test:/\.css$/,use:['style-loader',ordinary]}
  ]}] as any,'/b','/r','/p',resolveOptions()).installed).toBe(1);
 });
 it('拒绝 use/condition 数组隐藏的函数项、modules 缺省配置与不一致的自定义 auto',()=>{
  expect(()=>installBridgeLoader([{use:['style-loader',()=>css,css]}] as any,'/b','/r','/p',resolveOptions())).toThrow(/webpack\.rule\.use-function/);
  expect(()=>installBridgeLoader([{test:/\.css$/,include:[/\/p\//,()=>true],use:['style-loader',css]}] as any,'/b','/r','/p',resolveOptions())).toThrow(/webpack\.rule-condition/);
  expect(()=>installBridgeLoader([{test:/\.css$/,exclude:[/node_modules/,()=>false],use:['style-loader',css]}] as any,'/b','/r','/p',resolveOptions())).toThrow(/webpack\.rule-condition/);
  expect(()=>installBridgeLoader([{use:['style-loader',{loader:'css-loader'}]}] as any,'/b','/r','/p',resolveOptions())).toThrow(/css-loader\.modules-auto/);
  const customAuto={...css,options:{modules:{auto:/\.component\.css$/,namedExport:false}}};
  expect(()=>installBridgeLoader([{test:/\.css$/,use:['style-loader',customAuto]}] as any,'/b','/r','/p',resolveOptions())).toThrow(/css-loader\.modules-auto/);
 });
 it('拒绝显式或继承 source map，但允许目标 rule 显式关闭继承',()=>{
  expect(()=>installBridgeLoader([{use:['style-loader',{...css,options:{modules:{auto:modulesAuto,namedExport:false},sourceMap:true}}]}] as any,'/b','/r','/p',resolveOptions())).toThrow(/css-source-map/);
  expect(()=>installBridgeLoader([{use:['style-loader',css]}] as any,'/b','/r','/p',resolveOptions(),true)).toThrow(/css-source-map/);
  const rules:any[]=[{use:['style-loader',{...css,options:{modules:{auto:modulesAuto,namedExport:false},sourceMap:false}}]}];
  expect(installBridgeLoader(rules,'/b','/r','/p',resolveOptions(),true).installed).toBe(1);
 });
 it('拒绝可能同时处理同一 Module 的多个 pipeline 与 loader shorthand',()=>{
  expect(()=>installBridgeLoader([
   {test:/\.css$/,use:['style-loader',css]},
   {test:/\.module\.css$/,use:['style-loader',css]}
  ] as any,'/b','/r','/p',resolveOptions())).toThrow(/webpack\.overlapping-css-pipelines/);
  expect(()=>installBridgeLoader([
   {test:/\.css$/,use:['style-loader',css]},
   {test:/\.module\.scss$/,loader:'css-loader',options:{modules:{auto:modulesAuto,namedExport:false}}}
  ] as any,'/b','/r','/p',resolveOptions())).toThrow(/webpack\.rule-loader-shorthand/);
 });
 it('拒绝 named exports、builtin CSS 与未知 owner',()=>{
  expect(()=>installBridgeLoader([{use:['style-x',css]}] as any,'/b','/r','/p',resolveOptions())).toThrow(/webpack\.css-owner/);
  expect(()=>installBridgeLoader([{use:['style-loader',{...css,options:{modules:{auto:modulesAuto,namedExport:true}}}]}] as any,'/b','/r','/p',resolveOptions())).toThrow(/namedExport/);
  expect(()=>installBridgeLoader([{type:'css/module'}] as any,'/b','/r','/p',resolveOptions())).toThrow(/builtin-css/);
 });
});
