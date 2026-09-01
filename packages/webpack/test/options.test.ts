import { describe,expect,it } from 'vitest';
import { resolveCoreOptions, resolveOptions } from '../src/options.js';
describe('Webpack options',()=>{
 it('保持稳定默认值',()=>expect(resolveOptions()).toMatchObject({cssFilename:'static/css/semantic-atomic.css',manifest:{enabled:false},report:{enabled:false},devtools:{enabled:false}}));
 it('共享 resolver 只设置环境默认并尊重显式策略',()=>{
  expect(resolveCoreOptions({},true)).toMatchObject({className:{strategy:'readable-keyed'}});
  expect(resolveCoreOptions({},false)).toMatchObject({className:{strategy:'compact-keyed'}});
  expect(resolveCoreOptions({className:{strategy:'readable'}},false)).toMatchObject({className:{strategy:'readable'}});
  expect(resolveCoreOptions({className:{strategy:'hash',prefix:''}},true)).toEqual({className:{strategy:'hash',prefix:''}});
 });
 it('拒绝 strict 与越界 asset',()=>{expect(()=>resolveOptions({diagnostics:{strict:true}})).toThrow(/unsupported-feature/);expect(()=>resolveOptions({cssFilename:'../x.css'})).toThrow(/invalid-asset/);});
});
