import { describe, expect, it } from 'vitest';
import { createCssModuleTokens, createCssModulesScopeStrategy, isCssModuleFile } from '../src/cssModules.js';
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

  it('支持 camelCase tokens key 同时保留原始 key', () => {
    const tokens = createCssModuleTokens(createTokenMappings(), 'camelCase');

    expect(tokens).toEqual({
      'primary-button': 'Button_primary-button__hash _a',
      primaryButton: 'Button_primary-button__hash _a',
      plain: 'Button_plain__hash _b'
    });
  });

  it('支持 dashes tokens key 同时保留原始 key', () => {
    const tokens = createCssModuleTokens(createTokenMappings(), 'dashes');

    expect(tokens).toEqual({
      'primary-button': 'Button_primary-button__hash _a',
      primaryButton: 'Button_primary-button__hash _a',
      plain: 'Button_plain__hash _b'
    });
  });

  it('支持 dashesOnly tokens key', () => {
    const tokens = createCssModuleTokens(createTokenMappings(), 'dashesOnly');

    expect(tokens).toEqual({
      primaryButton: 'Button_primary-button__hash _a',
      plain: 'Button_plain__hash _b'
    });
  });

  it('重复导出 key 冲突时原始 key 优先，alias 不覆盖真实 camelCase class', () => {
    const tokens = createCssModuleTokens(
      {
        'primary-button': {
          sourceClassName: 'primary-button',
          resolvedClassName: 'Button_primary-button__hash',
          atomicClassNames: ['_a'],
          suggestedClassName: 'Button_primary-button__hash _a'
        },
        primaryButton: {
          sourceClassName: 'primaryButton',
          resolvedClassName: 'Button_primaryButton__hash',
          atomicClassNames: ['_b'],
          suggestedClassName: 'Button_primaryButton__hash _b'
        }
      },
      'camelCase'
    );

    expect(tokens).toEqual({
      'primary-button': 'Button_primary-button__hash _a',
      primaryButton: 'Button_primaryButton__hash _b'
    });
  });

  it('Only 策略重复导出 key 冲突时保留首次出现的稳定结果', () => {
    const tokens = createCssModuleTokens(
      {
        'primary-button': {
          sourceClassName: 'primary-button',
          resolvedClassName: 'Button_primary-button__hash',
          atomicClassNames: ['_a'],
          suggestedClassName: 'Button_primary-button__hash _a'
        },
        primaryButton: {
          sourceClassName: 'primaryButton',
          resolvedClassName: 'Button_primaryButton__hash',
          atomicClassNames: ['_b'],
          suggestedClassName: 'Button_primaryButton__hash _b'
        }
      },
      'dashesOnly'
    );

    expect(tokens).toEqual({
      primaryButton: 'Button_primary-button__hash _a'
    });
  });

  it('支持字符串模板 scopedName 配置', () => {
    const scope = createCssModulesScopeStrategy({
      id: '/project/src/Button.module.css',
      css: '.primary-button { color: red; }',
      root: '/project',
      options: {
        ...options,
        modules: {
          ...options.modules,
          generateScopedName: 'gss_[name]__[local]__[hash:base64:5]'
        }
      }
    });

    expect(
      scope.resolveClassName('primary-button', {
        id: '/project/src/Button.module.css',
        originalSelector: '.primary-button',
        usage: 'safe-rule'
      })
    ).toMatch(/^gss_Button__primary-button__[a-f0-9]{6}$/);
  });

  it('支持函数 scopedName 配置并修正数字开头 class name', () => {
    const scope = createCssModulesScopeStrategy({
      id: '/project/src/Button.module.css',
      css: '.button { color: red; }',
      root: '/project',
      options: {
        ...options,
        modules: {
          ...options.modules,
          generateScopedName: (name) => `123_${name}`
        }
      }
    });

    expect(
      scope.resolveClassName('button', {
        id: '/project/src/Button.module.css',
        originalSelector: '.button',
        usage: 'safe-rule'
      })
    ).toBe('_123_button');
  });
});

/** 创建覆盖 dashed 与普通 class 的 tokens fixture。 */
function createTokenMappings(): Parameters<typeof createCssModuleTokens>[0] {
  return {
    'primary-button': {
      sourceClassName: 'primary-button',
      resolvedClassName: 'Button_primary-button__hash',
      atomicClassNames: ['_a'],
      suggestedClassName: 'Button_primary-button__hash _a'
    },
    plain: {
      sourceClassName: 'plain',
      resolvedClassName: 'Button_plain__hash',
      atomicClassNames: ['_b'],
      suggestedClassName: 'Button_plain__hash _b'
    }
  };
}
