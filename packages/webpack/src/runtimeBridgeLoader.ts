/** Webpack 5 public `importModule` css-loader bridge。 */
import path from 'node:path';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import {
  augmentLocals,
  collectAmbiguousExportPreserveClassNames,
  collectAssetPreserveClassNames,
  collectAtomicClassByKey,
  collectExportedClassNames,
  createBridgeError,
  createDevStyleSnapshot,
  mergeClassPreservationEvidence,
  transformCompiledInput,
  validateAndCloneRow,
  validateLocals,
  type CompiledCssInput,
  type CompiledTransform,
  type CssRuntimeRow
} from '@semantic-atomic-css/css-loader-bridge';
import type { TransformClassMapping, TransformCssOptions, TransformCssResult } from '@semantic-atomic-css/core';
import { metadataFilename, serializeMetadata, type WebpackBridgeMetadata } from './metadata.js';

export type WebpackBridgeLoaderOptions = { root:string; include:string[]; exclude:string[]; core:TransformCssOptions; isDev:boolean; warn:boolean; devRuntimePath:string; publicPath?:string };
type LoaderContext = {
  resourcePath:string; rootContext:string;
  getOptions():WebpackBridgeLoaderOptions;
  importModule<T>(request:string,options?:{baseUri?:string}):Promise<T>;
  emitFile(name:string,content:string):void;
  emitWarning(error:Error):void;
};
const syntheticRelativePath='/__semantic_atomic_css_relative_base__/';
const syntheticBaseUri=`webpack-semantic-atomic-css://${syntheticRelativePath}`;

export default function runtimeBridgeLoader(source:string):string { return source; }

/** pitch 执行右侧 native css-loader，替换 rows、增强 locals 并 emit cacheable metadata。 */
export async function pitch(this:LoaderContext,remainingRequest:string):Promise<string|undefined> {
  const options=this.getOptions();
  if(!isTargetCssModule(this.resourcePath,options)) return undefined;
  const request=`${this.resourcePath}.webpack[javascript/auto]!=!!!${remainingRequest}`;
  const namespace=await this.importModule<{__esModule?:boolean;default?:unknown}|unknown>(request,{baseUri:syntheticBaseUri});
  const cssExport=readDefaultExport(namespace);
  if(!Array.isArray(cssExport)) throw createBridgeError('css-loader.exportType',this.resourcePath,'原生 default export 不是 array。');
  const rows=cssExport.map((row)=>{ const clone=validateAndCloneRow(row,this.resourcePath); clone[1]=normalizeSyntheticAssetUrls(clone[1],options.publicPath); return clone; });
  const nativeLocals=validateLocals((cssExport as CssRuntimeRow[] & {locals?:unknown}).locals,this.resourcePath);
  const exported=collectExportedClassNames(nativeLocals);
  const preserve=mergeClassPreservationEvidence(
    collectAssetPreserveClassNames(rows,nativeLocals),
    collectAmbiguousExportPreserveClassNames(nativeLocals,exported)
  );
  const mappings:Record<string,TransformClassMapping>={};
  const inputs:CompiledCssInput[]=[];
  const transforms:CompiledTransform[]=[];
  for(const row of rows){
    const id=readRowResourceId(row[0],this.resourcePath);
    if(!isTargetCssModule(id,options)) continue;
    const input:CompiledCssInput={id,scopedCss:row[1],exportedClassNames:[...exported].sort(compareText),preserveClassNames:{...preserve}};
    const transform=transformCompiledInput(input,options.core);
    row[1]=options.isDev?'':transform.css.preserved;
    row[3]=undefined;
    Object.assign(mappings,transform.classes);
    inputs.push(input); transforms.push({id,scopedCss:input.scopedCss,transform});
    if(options.warn) emitDiagnostics(this,transform);
  }
  const augmented=augmentLocals(nativeLocals,mappings);
  const metadata:WebpackBridgeMetadata={schemaVersion:2,owner:this.resourcePath,inputs,atomicClassByKey:collectAtomicClassByKey(transforms)};
  const serialized=serializeMetadata(metadata);
  this.emitFile(metadataFilename(this.resourcePath,serialized),serialized);
  const imports=[`import nativeCss from ${JSON.stringify(request)};`,...(options.isDev?[`import { registerDevStyles } from ${JSON.stringify(options.devRuntimePath)};`]:[])];
  const registration=options.isDev?[`const disposeDevStyles=registerDevStyles('webpack',${JSON.stringify(this.resourcePath)},${JSON.stringify(createDevStyleSnapshot(transforms))});`,`if(module.hot) module.hot.dispose(disposeDevStyles);`]:[];
  return [...imports,`const transformedRows=${JSON.stringify(rows)};`,'if(!Array.isArray(nativeCss)||nativeCss.length!==transformedRows.length) throw new Error("[semantic-atomic-css] css-loader.runtime-rows");','for(let index=0;index<transformedRows.length;index+=1) nativeCss[index]=transformedRows[index];',`nativeCss.locals=${JSON.stringify(augmented)};`,...registration,'export default nativeCss;'].join('\n');
}

/**
 * 只去除 importModule synthetic scheme，并利用专用 marker 区分相对与根路径 publicPath。
 */
export function normalizeSyntheticAssetUrls(css:string,publicPath?:string):string {
  const root=postcss.parse(css);
  root.walkDecls((decl)=>{ const parsed=valueParser(decl.value); let changed=false; parsed.walk((node)=>{
    if(node.type!=='function'||node.value.toLowerCase()!=='url') return;
    const value=node.nodes.find((child)=>child.type==='word'||child.type==='string');
    if(!value||!value.value.startsWith('webpack-semantic-atomic-css:')) return;
    const url=new URL(value.value);
    let pathname=url.pathname;
    const hostedPrefix=readHostedPublicPath(publicPath);
    if(hostedPrefix&&url.pathname.startsWith(hostedPrefix.pathname)) {
      pathname=`${hostedPrefix.publicPath}${url.pathname.slice(hostedPrefix.pathname.length)}`;
    } else if(isRootPublicPath(publicPath)&&url.pathname.startsWith(publicPath)) {
      // 静态根 publicPath 可能与内部 marker 同名；显式 publicPath evidence 优先，不能误删真实前缀。
      pathname=url.pathname;
    } else if(url.pathname.startsWith(syntheticRelativePath)) {
      pathname=url.pathname.slice(syntheticRelativePath.length);
    } else if(isRelativePublicPath(publicPath)) {
      const resolvedPrefix = new URL(publicPath, syntheticBaseUri).pathname;
      if (url.pathname.startsWith(resolvedPrefix)) pathname = `${publicPath}${url.pathname.slice(resolvedPrefix.length)}`;
    }
    value.value=`${pathname}${url.search}${url.hash}`;
    changed=true;
    return false;
  }); if(changed) decl.value=parsed.toString(); });
  return root.toString();
}

/** 判断静态 publicPath 是否为需要保留的相对前缀。 */
function isRelativePublicPath(publicPath: string | undefined): publicPath is string {
  return !!publicPath && publicPath !== 'auto' && !publicPath.startsWith('/') && !/^[a-z][a-z\d+.-]*:/i.test(publicPath);
}
/** 判断静态根 publicPath；hosted URL 由独立分支恢复 origin。 */
function isRootPublicPath(publicPath:string|undefined):publicPath is string { return !!publicPath&&publicPath.startsWith('/')&&!publicPath.startsWith('//'); }
/** 提取 protocol-relative 或绝对 HTTP(S) publicPath 的 pathname，同时保留原 CDN origin/prefix。 */
function readHostedPublicPath(publicPath:string|undefined):{publicPath:string;pathname:string}|undefined {
  if(publicPath?.startsWith('//')) return {publicPath,pathname:new URL(`https:${publicPath}`).pathname};
  if(publicPath&&/^https?:\/\//i.test(publicPath)) return {publicPath,pathname:new URL(publicPath).pathname};
  return undefined;
}

export function isTargetCssModule(id:string,options:Pick<WebpackBridgeLoaderOptions,'root'|'include'|'exclude'>):boolean {
  const normalized=normalizePath(id); if(!/\.module\.(?:css|scss|less)$/.test(normalized)) return false;
  return matchesAny(normalized,options.root,options.include)&&!matchesAny(normalized,options.root,options.exclude);
}
function matchesAny(id:string,root:string,patterns:string[]):boolean { const relative=path.relative(root,id); const value=normalizePath(relative.startsWith('..')?id:relative); return patterns.some((pattern)=>matches(value,pattern)||matches(id,pattern)); }
/** 把受支持的 star/globstar 编译为正则；globstar 后接目录分隔符时必须允许零层目录。 */
function matches(value:string,pattern:string):boolean {
  const normalized=normalizePath(pattern);
  let source='';
  for(let index=0;index<normalized.length;){
    if(normalized.startsWith('**/',index)){source+='(?:.*/)?';index+=3;continue;}
    if(normalized.startsWith('**',index)){source+='.*';index+=2;continue;}
    if(normalized[index]==='*'){source+='[^/]*';index+=1;continue;}
    source+=normalized[index]!.replace(/[\\^$.*+?()[\]{}|]/g,'\\$&');
    index+=1;
  }
  return new RegExp(`^${source}$`).test(value);
}
function readDefaultExport(value:any):unknown { return value&&typeof value==='object'&&value.__esModule?value.default:value; }
function readRowResourceId(value:unknown,resourcePath:string):string { if(typeof value!=='string') throw createBridgeError('css-loader.row-id',resourcePath,'row id 不是字符串。'); const request=value.split('!').at(-1)??value; const id=request.split('?')[0]?.split('#')[0]; if(!id||!path.isAbsolute(id)) throw createBridgeError('css-loader.row-id',resourcePath,`无法读取绝对资源路径：${value}`); return id; }
function emitDiagnostics(context:LoaderContext,transform:TransformCssResult):void { for(const diagnostic of transform.diagnostics) context.emitWarning(new Error(`[semantic-atomic-css] ${diagnostic.code} id=${diagnostic.id} reason=${diagnostic.reason??'unknown'} selector=${diagnostic.selector??''}`)); }
function normalizePath(value:string):string{return value.replace(/\\/g,'/');}
function compareText(a:string,b:string):number{return a<b?-1:a>b?1:0;}
