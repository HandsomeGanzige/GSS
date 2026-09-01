import { describe,expect,it } from 'vitest';
import {
  augmentLocals,
  collectAmbiguousExportPreserveClassNames,
  collectAssetPreserveClassNames,
  createDevStyleSnapshot,
  mergeClassPreservationEvidence,
  transformCompiledInput,
  validateAndCloneRow,
  validateLocals,
  type CssRuntimeRow
} from '../src/cssLoaderExport.js';
describe('css-loader rows/default locals seam',()=>{
 it('校验 rows/locals 并防御性复制',()=>{const row:CssRuntimeRow=['/a.css','.a{color:red}'];const clone=validateAndCloneRow(row,'/a.css');clone[1]='';expect(row[1]).toContain('color');expect(validateLocals({a:'A_hash'},'/a.css')).toEqual({a:'A_hash'});expect(()=>validateLocals(undefined,'/a.css')).toThrow(/default-locals/);});
 it('增强 class token、保留 ICSS 同值并输出最小 dev snapshot',()=>{const locals={button:'A_button',collision:'A_collision',collisionValue:'A_collision'};const exported=new Set(['A_button','A_collision']);const preserve=collectAmbiguousExportPreserveClassNames(locals,exported);const transform=transformCompiledInput({id:'/a.css',scopedCss:'.A_button{color:red}.A_collision{color:blue}',exportedClassNames:[...exported],preserveClassNames:preserve},{className:{strategy:'readable'}});expect(preserve).toEqual({A_collision:'ambiguous-export-value'});expect(augmentLocals(locals,transform.classes).button).toContain('_selector_');const snapshot=createDevStyleSnapshot([{id:'/a.css',scopedCss:'',transform}]);expect(snapshot.sources[0]?.atomic[0]?.declaration).toEqual({prop:'color',value:'red',important:false});expect(snapshot.sources[0]?.atomic[0]?.declaration).not.toHaveProperty('source');});
 it('资源 class 及 composed token 闭包整类保留',()=>{const rows:CssRuntimeRow[]=[['/a.css','.A_asset{background:url(/a.svg)}']];expect(collectAssetPreserveClassNames(rows,{asset:'A_asset A_composed'})).toEqual({A_asset:'asset-reference',A_composed:'asset-reference'});});
 it('保留 evidence 使用与输入顺序无关的稳定优先级',()=>{
  const asset={A_shared:'asset-reference' as const};const ambiguous={A_shared:'ambiguous-export-value' as const};
  expect(mergeClassPreservationEvidence(asset,ambiguous)).toEqual(asset);
  expect(mergeClassPreservationEvidence(ambiguous,asset)).toEqual(asset);
 });
});
