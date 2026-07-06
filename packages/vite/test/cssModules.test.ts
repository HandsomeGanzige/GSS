import { describe, expect, it } from 'vitest';
import { createCssModuleTokens, isCssModuleFile } from '../src/cssModules.js';
import type { ResolvedSemanticAtomicCssOptions } from '../src/types.js';

const options: ResolvedSemanticAtomicCssOptions = {
  include: ['**/*.module.css'],
  exclude: ['**/node_modules/**'],
  modules: {
    localsConvention: 'asIs',
    namedExports: false
  },
  core: {
    preserveResolvedClass: true
  },
  manifest: {
    enabled: false,
    filename: 'semantic-atomic-manifest.json'
  },
  report: {
    enabled: false,
    filename: 'semantic-atomic-report.json'
  },
  diagnostics: {
    warn: true,
    strict: false
  }
};

describe('cssModules adapter helpers', () => {
  it('只匹配第一版支持的 .module.css 文件', () => {
    expect(isCssModuleFile('/project/src/Button.module.css', '/project', options)).toBe(true);
    expect(isCssModuleFile('/project/src/Button.module.scss', '/project', options)).toBe(false);
    expect(isCssModuleFile('/project/src/global.css', '/project', options)).toBe(false);
    expect(isCssModuleFile('/project/node_modules/pkg/Button.module.css', '/project', options)).toBe(false);
  });

  it('默认使用 source class 作为 tokens key', () => {
    const tokens = createCssModuleTokens(
      {
        'primary-button': {
          sourceClassName: 'primary-button',
          resolvedClassName: 'Button_primary-button__hash',
          atomicClassNames: ['_a'],
          suggestedClassName: 'Button_primary-button__hash _a'
        }
      },
      'asIs'
    );

    expect(tokens).toEqual({
      'primary-button': 'Button_primary-button__hash _a'
    });
  });

  it('支持 camelCaseOnly tokens key', () => {
    const tokens = createCssModuleTokens(
      {
        'primary-button': {
          sourceClassName: 'primary-button',
          resolvedClassName: 'Button_primary-button__hash',
          atomicClassNames: ['_a'],
          suggestedClassName: 'Button_primary-button__hash _a'
        }
      },
      'camelCaseOnly'
    );

    expect(tokens).toEqual({
      primaryButton: 'Button_primary-button__hash _a'
    });
  });
});
