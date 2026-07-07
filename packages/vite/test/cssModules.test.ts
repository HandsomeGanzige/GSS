import { describe, expect, it } from 'vitest';
import {
  augmentCssModuleTokens,
  collectExportedClassNames,
  createCssModulesScopeStrategy,
  createPreprocessCssModulesOptions,
  isCssModuleFile
} from '../src/cssModules.js';
import type { ResolvedSemanticAtomicCssOptions } from '../src/types.js';

const options: ResolvedSemanticAtomicCssOptions = {
  include: ['**/*.module.css'],
  exclude: ['**/node_modules/**'],
  modules: {
    localsConvention: undefined,
    hasLocalsConvention: false,
    generateScopedName: undefined,
    hasGenerateScopedName: false,
    namedExports: false,
    configured: false
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

describe('cssModules Route A helpers', () => {
  it('只匹配第一版支持的 .module.css 文件', () => {
    expect(isCssModuleFile('/project/src/Button.module.css', '/project', options)).toBe(true);
    expect(isCssModuleFile('/project/src/Button.module.scss', '/project', options)).toBe(false);
    expect(isCssModuleFile('/project/src/global.css', '/project', options)).toBe(false);
    expect(isCssModuleFile('/project/node_modules/pkg/Button.module.css', '/project', options)).toBe(false);
  });

  it('从 Vite tokens 和 scoped CSS 中收集可能进入 DOM 的 class name', () => {
    const classNames = collectExportedClassNames(
      {
        button: 'Button_button__hash Base_base__hash',
        brand: '#0f0',
        exportedText: 'hello world'
      },
      '.Button_button__hash { color: red; }\n.Base_base__hash { color: blue; }'
    );

    expect([...classNames]).toEqual(['Button_button__hash', 'Base_base__hash']);
  });

  it('identity scope 只允许 Vite tokens 中确认的 class 参与导出', () => {
    const scope = createCssModulesScopeStrategy(new Set(['Button_button__hash']));

    expect(
      scope.resolveClassName('Button_button__hash', {
        id: '/project/src/Button.module.css',
        originalSelector: '.Button_button__hash',
        usage: 'safe-rule'
      })
    ).toBe('Button_button__hash');
    expect(
      scope.shouldExportClassName?.('Button_button__hash', {
        id: '/project/src/Button.module.css',
        originalSelector: '.Button_button__hash',
        usage: 'safe-rule'
      })
    ).toBe(true);
    expect(
      scope.shouldExportClassName?.('ant-btn', {
        id: '/project/src/Button.module.css',
        originalSelector: '.ant-btn',
        usage: 'safe-rule'
      })
    ).toBe(false);
  });

  it('只给匹配到 class mapping 的 Vite token 追加 atomic class', () => {
    const tokens = augmentCssModuleTokens(
      {
        button: 'Button_button__hash',
        composed: 'Button_button__hash Base_base__hash',
        brand: '#0f0'
      },
      {
        Button_button__hash: {
          sourceClassName: 'Button_button__hash',
          resolvedClassName: 'Button_button__hash',
          atomicClassNames: ['_a', '_b'],
          suggestedClassName: 'Button_button__hash _a _b'
        },
        Base_base__hash: {
          sourceClassName: 'Base_base__hash',
          resolvedClassName: 'Base_base__hash',
          atomicClassNames: ['_a', '_c'],
          suggestedClassName: 'Base_base__hash _a _c'
        }
      }
    );

    expect(tokens).toEqual({
      button: 'Button_button__hash _a _b',
      composed: 'Button_button__hash Base_base__hash _a _b _c',
      brand: '#0f0'
    });
  });

  it('未显式配置 GSS modules 时继承 Vite css.modules', () => {
    const modules = createPreprocessCssModulesOptions(
      {
        localsConvention: 'camelCaseOnly',
        generateScopedName: 'native_[local]'
      },
      options
    );

    expect(modules).toEqual({
      localsConvention: 'camelCaseOnly',
      generateScopedName: 'native_[local]'
    });
  });

  it('显式配置 GSS modules 后不再继承 Vite css.modules', () => {
    const modules = createPreprocessCssModulesOptions(
      {
        localsConvention: 'camelCaseOnly',
        generateScopedName: 'native_[local]'
      },
      {
        ...options,
        modules: {
          ...options.modules,
          localsConvention: 'asIs',
          hasLocalsConvention: true,
          configured: true
        }
      }
    );

    expect(modules).toEqual({});
  });

  it('Vite css.modules false 在 GSS 未显式配置时保持关闭', () => {
    expect(createPreprocessCssModulesOptions(false, options)).toBe(false);
  });

  it('GSS 显式 modules 配置可以覆盖 Vite css.modules false', () => {
    const modules = createPreprocessCssModulesOptions(false, {
      ...options,
      modules: {
        ...options.modules,
        hasGenerateScopedName: true,
        generateScopedName: 'gss_[local]',
        configured: true
      }
    });

    expect(modules).toEqual({
      generateScopedName: 'gss_[local]'
    });
  });
});
