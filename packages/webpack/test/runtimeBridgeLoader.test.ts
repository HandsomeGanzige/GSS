import { describe,expect,it } from 'vitest';
import { isTargetCssModule,normalizeSyntheticAssetUrls } from '../src/runtimeBridgeLoader.js';
describe('Webpack bridge helpers',()=>{
 it('匹配目标后缀',()=>{const o={root:'/p',include:['**/*.module.css'],exclude:['**/node_modules/**']};expect(isTargetCssModule('/p/src/A.module.css',o)).toBe(true);expect(isTargetCssModule('/p/src/a.css',o)).toBe(false);});
 it('globstar 目录同时匹配零层与多层目录，并保持 exclude 生效',()=>{
  const o={root:'/p',include:['src/**/*.module.css'],exclude:['**/generated/**']};
  expect(isTargetCssModule('/p/src/A.module.css',o)).toBe(true);
  expect(isTargetCssModule('/p/src/components/A.module.css',o)).toBe(true);
  expect(isTargetCssModule('/p/src/generated/A.module.css',o)).toBe(false);
 });
 it('只移除 synthetic scheme/marker，并保留相对、根路径、query/hash、引号和绝对 CDN URL',()=>{
  expect(normalizeSyntheticAssetUrls([
   '.a {',
   '  background: url("webpack-semantic-atomic-css:///__semantic_atomic_css_relative_base__/cdn/icon.svg?q=1#mark");',
   '  mask: url(webpack-semantic-atomic-css:///cdn/root.svg?q=2#root);',
   '  cursor: url(https://cdn.test/cursor.svg), auto;',
   '}'
  ].join('\n'))).toBe([
   '.a {',
   '  background: url("cdn/icon.svg?q=1#mark");',
   '  mask: url(/cdn/root.svg?q=2#root);',
   '  cursor: url(https://cdn.test/cursor.svg), auto;',
   '}'
  ].join('\n'));
 });
 it('使用 protocol-relative publicPath 恢复 CDN host，并避免把同名根 publicPath 当成内部 marker',()=>{
  expect(normalizeSyntheticAssetUrls(
   '.a{background:url("webpack-semantic-atomic-css:///assets/hash.svg")}',
   '//cdn.example.com/assets/'
  )).toBe('.a{background:url("//cdn.example.com/assets/hash.svg")}');
  expect(normalizeSyntheticAssetUrls(
   '.a{background:url("webpack-semantic-atomic-css:///assets/hash.svg")}',
   'https://cdn.example.com/assets/'
  )).toBe('.a{background:url("https://cdn.example.com/assets/hash.svg")}');
  expect(normalizeSyntheticAssetUrls(
   '.a{background:url("webpack-semantic-atomic-css:///__semantic_atomic_css_relative_base__/hash.svg")}',
   '/__semantic_atomic_css_relative_base__/'
  )).toBe('.a{background:url("/__semantic_atomic_css_relative_base__/hash.svg")}');
 });
 it('使用静态相对 publicPath 恢复越过 marker 的父级路径',()=>{
  expect(normalizeSyntheticAssetUrls(
   '.a{background:url("webpack-semantic-atomic-css:///cdn/icon.svg?q#h")}',
   '../cdn/'
  )).toBe('.a{background:url("../cdn/icon.svg?q#h")}');
 });
});
