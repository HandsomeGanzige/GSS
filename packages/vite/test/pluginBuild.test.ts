import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build, type CSSModulesOptions, type CSSOptions, type RenderBuiltAssetUrl } from 'vite';
import { semanticAtomicCss } from '../src/plugin.js';

const tempRoots: string[] = [];
type TestCssModulesOptions = CSSModulesOptions & { namedExports?: boolean };

describe('semanticAtomicCss build plugin', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('build 默认使用 hash atomic className 策略', async () => {
    const root = await createBuildFixture('.button {\n  color: red;\n}');

    await runBuild(root);

    const css = await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8');

    expect(css).toMatch(/\._[a-z0-9]{8}\s+\{/);
    expect(css).not.toContain('._color_red');
  });

  it('build 支持显式 readable className 策略和自定义 prefix', async () => {
    const root = await createBuildFixture('.button {\n  color: red;\n}');

    await runBuild(root, {
      core: {
        className: {
          strategy: 'readable',
          prefix: 'gss-'
        }
      }
    });

    const css = await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8');

    expect(css).toContain('.gss-color_red');
  });

  it('build 将 url() 关联 class 整体保留，并在聚合 CSS 中解析本地资源', async () => {
    const root = await createBuildFixture(
      '.hero { color: red; background: url("./mark.svg#phase5") no-repeat; }',
      {
        extraFiles: {
          'mark.svg': '<svg xmlns="http://www.w3.org/2000/svg"><circle id="phase5" r="4" /></svg>'
        }
      }
    );

    await runBuild(
      root,
      {
        core: { className: { strategy: 'readable' } },
        report: { enabled: true }
      },
      undefined,
      { base: './', assetsInlineLimit: 0 }
    );

    const css = await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8');
    const js = await readBuiltAssets(join(root, 'dist/assets'), '.js');
    const report = JSON.parse(await readFile(join(root, 'dist/semantic-atomic-report.json'), 'utf8'));
    const assetNames = (await readdir(join(root, 'dist/assets'))).filter((name) => name.endsWith('.svg'));

    expect(assetNames).toHaveLength(1);
    expect(css).toContain(`url("./${assetNames[0]}#phase5")`);
    expect(css).toContain('color: red;');
    expect(css).not.toContain('._color_red');
    expect(css).not.toContain('__VITE_ASSET__');
    expect(js).not.toContain('_color_red');
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'preserved-class', reason: 'asset-reference' })
    );
  });

  it('publicDir 资源和自定义 renderBuiltUrl 在资源 class 中明确失败', async () => {
    const publicRoot = await createBuildFixture('.hero { background: url("/mark.svg"); }');
    await mkdir(join(publicRoot, 'public'), { recursive: true });
    await writeFile(join(publicRoot, 'public/mark.svg'), '<svg xmlns="http://www.w3.org/2000/svg" />');

    await expect(runBuild(publicRoot)).rejects.toThrow('vite.public-asset-url');

    const customRoot = await createBuildFixture('.hero { background: url("./mark.svg"); }', {
      extraFiles: {
        'mark.svg': '<svg xmlns="http://www.w3.org/2000/svg" />'
      }
    });

    await expect(
      runBuild(customRoot, {}, undefined, {
        assetsInlineLimit: 0,
        renderBuiltUrl: () => ({ relative: true })
      })
    ).rejects.toThrow('vite.experimental.renderBuiltUrl');
  });

  it('SCSS/Less 由 Vite 原生预处理并共享 atomic/fallback 管线', async () => {
    const root = await createPreprocessorBuildFixture();

    await runBuild(
      root,
      {
        modules: {
          localsConvention: 'camelCaseOnly',
          generateScopedName: 'p5_[name]__[local]'
        },
        core: { className: { strategy: 'readable' } }
      },
      undefined,
      {
        preprocessorOptions: {
          scss: { additionalData: '$runtime-gap: 2px;\n' },
          less: { additionalData: '@runtime-radius: 7px;\n' }
        }
      }
    );

    const css = await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8');
    const js = await readBuiltAssets(join(root, 'dist/assets'), '.js');

    expect(js).toContain('p5_Button-module__button');
    expect(js).toContain('p5_Panel-module__panel');
    expect(js).toContain('_color_0f766e');
    expect(js).toContain('_background_eff6ff');
    expect(css).toContain('padding: 10px;');
    expect(css).toContain('border-radius: 7px;');
    expect(css).toContain('.p5_Panel-module__panel .p5_Panel-module__child');
    expect(css).not.toContain('$accent');
    expect(css).not.toContain('@panel-color');
  });

  it('build 聚合时把复用的媒体 atomic rule 稳定输出在后续基础规则之后', async () => {
    const root = await createBuildFixture(
      [
        '.early {',
        '  display: grid;',
        '}',
        '',
        '@media (max-width: 620px) {',
        '  .early {',
        '    grid-template-columns: 1fr;',
        '  }',
        '}',
        '',
        '@media (min-width: 1200px) {',
        '  .early {',
        '    gap: 24px;',
        '  }',
        '}',
        '',
        '.panel {',
        '  grid-template-columns: 200px 1fr;',
        '  gap: 8px;',
        '}',
        '',
        '@media (max-width: 1100px) {',
        '  .panel {',
        '    grid-template-columns: repeat(2, minmax(0, 1fr));',
        '  }',
        '}',
        '',
        '@media (max-width: 620px) {',
        '  .panel {',
        '    grid-template-columns: 1fr;',
        '  }',
        '}',
        '',
        '@media (min-width: 600px) {',
        '  .panel {',
        '    gap: 12px;',
        '  }',
        '}',
        '',
        '@media (min-width: 1200px) {',
        '  .panel {',
        '    gap: 24px;',
        '  }',
        '}'
      ].join('\n')
    );

    await runBuild(root, {
      core: {
        className: {
          strategy: 'readable'
        }
      }
    });

    const css = await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8');

    expect(css.indexOf('grid-template-columns: 200px 1fr;')).toBeLessThan(
      css.indexOf('grid-template-columns: repeat(2, minmax(0, 1fr));')
    );
    expect(css.indexOf('grid-template-columns: repeat(2, minmax(0, 1fr));')).toBeLessThan(
      css.indexOf('grid-template-columns: 1fr;')
    );
    expect(css.indexOf('gap: 8px;')).toBeLessThan(css.indexOf('gap: 12px;'));
    expect(css.indexOf('gap: 12px;')).toBeLessThan(css.indexOf('gap: 24px;'));
  });

  it('build 聚合结果按 source id 稳定排序，不依赖并发 transform 完成顺序', async () => {
    const root = await createBuildFixture(
      '.button {\n  color: blue;\n}\n.button[data-state="open"] {\n  border-color: blue;\n}',
      {
        mainJs: [
          "import button from './Button.module.css';",
          "import alpha from './Alpha.module.css';",
          "document.body.setAttribute('data-button', button.button);",
          "document.body.setAttribute('data-alpha', alpha.alpha);"
        ].join('\n'),
        extraFiles: {
          'Alpha.module.css':
            '.alpha {\n  color: red;\n}\n.alpha[data-state="open"] {\n  border-color: red;\n}'
        }
      }
    );

    await runBuild(root, {
      core: {
        className: {
          strategy: 'readable'
        }
      },
      manifest: { enabled: true },
      report: { enabled: true }
    });

    const css = await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8');
    const manifest = JSON.parse(await readFile(join(root, 'dist/semantic-atomic-manifest.json'), 'utf8')) as {
      atomic: Record<string, { sources: Array<{ id: string; line?: number; column?: number }> }>;
      classes: Record<string, unknown>;
    };
    const report = JSON.parse(await readFile(join(root, 'dist/semantic-atomic-report.json'), 'utf8')) as {
      diagnostics: Array<{ id: string; source?: { line?: number; column?: number } }>;
    };
    const atomicKeys = Object.keys(manifest.atomic);
    const classKeys = Object.keys(manifest.classes);

    expect(css.indexOf('color: red;')).toBeLessThan(css.indexOf('color: blue;'));
    expect(atomicKeys).toEqual([...atomicKeys].sort());
    expect(classKeys).toEqual([...classKeys].sort());
    expect(
      Object.values(manifest.atomic).every((entry) => {
        const locations = entry.sources.map((source) => `${source.id}:${source.line ?? 0}:${source.column ?? 0}`);
        return locations.join('\n') === [...locations].sort().join('\n');
      })
    ).toBe(true);
    expect(report.diagnostics.map((item) => item.id)).toEqual(
      report.diagnostics.map((item) => item.id).sort()
    );
  });

  it('显式开启 manifest/report 后保留基础 source location', async () => {
    const root = await createBuildFixture(
      [
        '.button {',
        '  color: red;',
        '}',
        '',
        '.button[data-state="open"] {',
        '  color: blue;',
        '}'
      ].join('\n')
    );

    await runBuild(root, {
      manifest: {
        enabled: true
      },
      report: {
        enabled: true
      }
    });

    const manifest = JSON.parse(await readFile(join(root, 'dist/semantic-atomic-manifest.json'), 'utf8'));
    const report = JSON.parse(await readFile(join(root, 'dist/semantic-atomic-report.json'), 'utf8'));
    const atomicEntry = Object.values(manifest.atomic)[0] as {
      declaration: { source?: { id: string; line?: number; column?: number } };
      sources: Array<{ id: string; line?: number; column?: number }>;
    };
    const classEntry = Object.values(manifest.classes)[0] as { id: string; sourceClassName: string };
    const diagnostic = report.diagnostics[0] as {
      code: string;
      reason: string;
      source?: { id: string; line?: number; column?: number };
    };

    expect(atomicEntry.declaration.source).toMatchObject({
      line: 2,
      column: 3
    });
    expect(atomicEntry.sources[0]).toMatchObject({
      line: 2,
      column: 3
    });
    expect(atomicEntry.sources[0]?.id).toMatch(/Button\.module\.css$/);
    expect(classEntry.sourceClassName).toContain('button');
    expect(classEntry.id).toMatch(/Button\.module\.css$/);
    expect(diagnostic).toMatchObject({
      code: 'unsafe-selector',
      reason: 'attribute-selector'
    });
    expect(diagnostic.source).toMatchObject({
      line: 5,
      column: 1
    });
    expect(report.analysis).toMatchObject({
      health: {
        status: 'risky'
      },
      risk: {
        unsafeReasonDistribution: {
          'attribute-selector': 1
        },
        highRiskFiles: [expect.objectContaining({ unsafeRules: 1 })]
      },
      size: {
        beforeRawCssBytes: expect.any(Number),
        afterGzipCssBytes: expect.any(Number),
        afterBrotliCssBytes: expect.any(Number)
      }
    });
  });

  it('build report 输出同一 semantic class 的 declaration 顺序冲突', async () => {
    const root = await createBuildFixture(
      [
        '.button {',
        '  color: red;',
        '  border: 1px solid transparent;',
        '}',
        '',
        '.button {',
        '  color: blue;',
        '  border-color: blue;',
        '}',
        '',
        '.label {',
        '  color: green;',
        '}'
      ].join('\n')
    );

    await runBuild(root, {
      core: {
        className: {
          strategy: 'readable'
        }
      },
      report: {
        enabled: true
      }
    });

    const report = JSON.parse(await readFile(join(root, 'dist/semantic-atomic-report.json'), 'utf8'));

    expect(report.analysis.risk.declarationConflictSummary).toEqual({
      total: 2,
      sameProperty: 1,
      shorthandLonghand: 1,
      affectedFiles: 1,
      affectedClasses: 1
    });
    expect(report.analysis.risk.declarationConflicts).toEqual([
      expect.objectContaining({
        kind: 'same-property',
        properties: ['color']
      }),
      expect.objectContaining({
        kind: 'shorthand-longhand',
        properties: ['border', 'border-color']
      })
    ]);
    expect(report.analysis.health).toMatchObject({
      status: 'risky',
      reasons: expect.arrayContaining(['存在同一 semantic class 的 declaration 顺序冲突'])
    });
  });

  it('原生管线处理 composes、:import、@value 和 :export', async () => {
    const root = await createBuildFixture(
      [
        ':import("./Tokens.module.css") {',
        '  importedBrand: brand;',
        '}',
        '@value gap: 8px;',
        ':export { exported: importedBrand; gapValue: gap; }',
        '.primary-button {',
        '  composes: base from "./Base.module.css";',
        '  background: importedBrand;',
        '  padding: gap;',
        '}'
      ].join('\n'),
      {
        mainJs: [
          "import './global.css';",
          "import styles from './Button.module.css';",
          "document.body.setAttribute('data-primary', styles.primaryButton);",
          "document.body.setAttribute('data-exported', styles.exported);",
          "document.body.setAttribute('data-gap', styles.gapValue);"
        ].join('\n'),
        extraFiles: {
          'Base.module.css': '.base {\n  color: red;\n}',
          'global.css': '.global-banner {\n  color: black;\n}',
          'Tokens.module.css': ':export {\n  brand: #0f0;\n}'
        }
      }
    );

    await runBuild(root, {
      modules: {
        localsConvention: 'camelCaseOnly',
        generateScopedName: 'x_[name]__[local]'
      },
      core: {
        className: {
          strategy: 'readable'
        }
      }
    });

    const css = await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8');
    const js = await readBuiltAssets(join(root, 'dist/assets'), '.js');
    const viteCss = await readBuiltAssetsExcept(join(root, 'dist/assets'), '.css', new Set(['semantic-atomic.css']));

    expect(js).toContain('x_Button-module__primary-button');
    expect(js).toContain('x_Base-module__base');
    expect(js).toContain('_background_0f0');
    expect(js).toContain('_padding_8px');
    expect(js).toContain('_color_red');
    expect(js).toContain('#0f0');
    expect(js).not.toContain('#0f0 _');
    expect(js).toContain('gapValue');
    expect(js).toContain('"8px"');
    expect(css).toContain('background: #0f0;');
    expect(css).toContain('padding: 8px;');
    expect(css).toContain('color: red;');
    expect(css).not.toContain('.x_Button-module__primary-button {');
    expect(viteCss).toContain('.global-banner');
    expect(viteCss).not.toContain('x_Button-module__primary-button');
  });

  it('原生管线对非导出 global selector 保留 fallback，避免生成无法命中 DOM 的 atomic CSS', async () => {
    const root = await createBuildFixture(
      [
        '.button {',
        '  color: red;',
        '}',
        '',
        ':global(.ant-btn) {',
        '  color: blue;',
        '}'
      ].join('\n')
    );

    await runBuild(root, {
      core: {
        className: {
          strategy: 'readable'
        }
      },
      report: {
        enabled: true
      }
    });

    const css = await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8');
    const report = JSON.parse(await readFile(join(root, 'dist/semantic-atomic-report.json'), 'utf8'));

    expect(css).toContain('._color_red');
    expect(css).toContain('.ant-btn');
    expect(css).toContain('color: blue;');
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'unsafe-selector',
        reason: 'non-exported-class'
      })
    );
  });

  it('Phase 4 对未实现的 namedExports 和 strict mode 显式失败', async () => {
    const root = await createBuildFixture('.button {\n  color: red;\n}');

    await expect(
      runBuild(root, {
        modules: {
          namedExports: true
        }
      })
    ).rejects.toThrow('modules.namedExports: true');

    await expect(runBuild(root, {}, { namedExports: true })).rejects.toThrow('css.modules.namedExports');

    await expect(
      runBuild(root, {
        diagnostics: {
          strict: true
        }
      })
    ).rejects.toThrow('diagnostics.strict: true');
  });

  it('Vite css.modules: false 且未显式配置 GSS modules 时失败', async () => {
    const root = await createBuildFixture('.button {\n  color: red;\n}');

    await expect(runBuild(root, {}, false)).rejects.toThrow('css.modules: false');
  });

  it('GSS 显式 modules 配置可在 Vite css.modules: false 下重新启用原生管线', async () => {
    const root = await createBuildFixture('.button {\n  color: red;\n}');

    await runBuild(
      root,
      {
        modules: {
          generateScopedName: 'gss_[local]'
        },
        core: {
          className: {
            strategy: 'readable'
          }
        }
      },
      false
    );

    const js = await readBuiltAssets(join(root, 'dist/assets'), '.js');
    const css = await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8');

    expect(js).toContain('gss_button');
    expect(js).toContain('_color_red');
    expect(css).toContain('._color_red');
  });

  it('GSS 显式 modules 配置会覆盖 Vite css.modules.namedExports', async () => {
    const root = await createBuildFixture('.button {\n  color: red;\n}');

    await runBuild(
      root,
      {
        modules: {
          generateScopedName: 'gss_[local]'
        },
        core: {
          className: {
            strategy: 'readable'
          }
        }
      },
      {
        namedExports: true,
        generateScopedName: 'native_[local]'
      }
    );

    const js = await readBuiltAssets(join(root, 'dist/assets'), '.js');

    expect(js).toContain('gss_button');
    expect(js).not.toContain('native_button');
  });
});

type BuildFixtureOptions = {
  mainJs?: string;
  extraFiles?: Record<string, string>;
};

type TestRunBuildOptions = {
  base?: string;
  assetsInlineLimit?: number;
  renderBuiltUrl?: RenderBuiltAssetUrl;
  preprocessorOptions?: CSSOptions['preprocessorOptions'];
};

/**
 * 创建最小 Vite build fixture，并登记到测试清理列表。
 *
 * @param css - 写入 fixture CSS Module 的源码。
 * @param options - 可选的入口与附加文件配置。
 * @returns 临时 fixture 根目录。
 */
async function createBuildFixture(css: string, options: BuildFixtureOptions = {}): Promise<string> {
  const root = await mkdtemp(join(process.cwd(), '.tmp-vite-build-'));
  const srcDir = join(root, 'src');
  tempRoots.push(root);
  await mkdir(srcDir, { recursive: true });
  await writeFile(join(root, 'index.html'), '<script type="module" src="/src/main.js"></script>');
  await writeFile(
    join(srcDir, 'main.js'),
    options.mainJs ??
      [
        "import styles from './Button.module.css';",
        "document.body.setAttribute('data-class-name', styles.button);"
      ].join('\n')
  );
  await writeFile(join(srcDir, 'Button.module.css'), css);

  for (const [filename, source] of Object.entries(options.extraFiles ?? {})) {
    const file = join(srcDir, filename);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, source);
  }

  return root;
}

/**
 * 在已安装 Sass/Less 的专用 fixture 目录下创建隔离构建根。
 *
 * @returns 可直接交给 Vite build 的临时 preprocessor fixture 根目录。
 * @remarks 复用 fixture 的依赖安装，避免预处理器依赖泄漏到 adapter 生产包。
 */
async function createPreprocessorBuildFixture(): Promise<string> {
  const fixtureDir = join(process.cwd(), '../../fixtures/vite-css-modules');
  const root = await mkdtemp(join(fixtureDir, '.tmp-vite-test-'));
  const srcDir = join(root, 'src');
  tempRoots.push(root);
  await mkdir(srcDir, { recursive: true });
  await writeFile(join(root, 'index.html'), '<script type="module" src="/src/main.js"></script>');
  await writeFile(
    join(srcDir, 'main.js'),
    [
      "import button from './Button.module.scss';",
      "import panel from './Panel.module.less';",
      "document.body.setAttribute('data-button', button.button);",
      "document.body.setAttribute('data-panel', panel.panel);"
    ].join('\n')
  );
  await writeFile(join(srcDir, '_tokens.scss'), '$accent: #0f766e;');
  await writeFile(
    join(srcDir, 'Button.module.scss'),
    [
      "@use './tokens' as tokens;",
      '.button {',
      '  color: tokens.$accent;',
      '  padding: calc(8px + $runtime-gap);',
      '  &:hover { color: #115e59; }',
      '}'
    ].join('\n')
  );
  await writeFile(join(srcDir, 'tokens.less'), '@panel-color: #eff6ff;');
  await writeFile(
    join(srcDir, 'Panel.module.less'),
    [
      "@import './tokens.less';",
      '.panel {',
      '  background: @panel-color;',
      '  border-radius: @runtime-radius;',
      '}',
      '.panel .child { font-weight: 700; }'
    ].join('\n')
  );
  return root;
}

/**
 * 运行带 GSS adapter 的 Vite build。
 *
 * @param root - 临时 fixture 根目录。
 * @param options - adapter 配置。
 * @param cssModules - Vite CSS Modules 配置，传 false 时显式禁用。
 * @param buildOptions - 测试需要覆盖的 Vite build 选项。
 * @returns 构建完成后解决。
 */
async function runBuild(
  root: string,
  options: Parameters<typeof semanticAtomicCss>[0] = {},
  cssModules?: false | TestCssModulesOptions,
  buildOptions: TestRunBuildOptions = {}
): Promise<void> {
  await build({
    root,
    base: buildOptions.base,
    configFile: false,
    logLevel: 'silent',
    css: {
      modules: cssModules,
      preprocessorOptions: buildOptions.preprocessorOptions
    },
    experimental: buildOptions.renderBuiltUrl
      ? { renderBuiltUrl: buildOptions.renderBuiltUrl }
      : undefined,
    plugins: [semanticAtomicCss(options)],
    build: {
      outDir: join(root, 'dist'),
      emptyOutDir: true,
      assetsInlineLimit: buildOptions.assetsInlineLimit
    }
  });
}

/**
 * 按目录遍历顺序读取 build 输出中指定后缀的 asset 内容。
 *
 * @param dir - build assets 目录。
 * @param extension - 要读取的文件扩展名。
 * @returns 以换行符拼接的 asset 内容。
 */
async function readBuiltAssets(dir: string, extension: string): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  const chunks: string[] = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(extension)) {
      chunks.push(await readFile(join(dir, entry.name), 'utf8'));
    }
  }

  return chunks.join('\n');
}

/**
 * 读取指定后缀的 build assets，并排除插件拥有的独立产物。
 *
 * @param dir - build assets 目录。
 * @param extension - 要读取的文件扩展名。
 * @param excludedNames - 不应参与拼接的 asset 文件名集合。
 * @returns 以换行符拼接的剩余 asset 内容。
 */
async function readBuiltAssetsExcept(dir: string, extension: string, excludedNames: Set<string>): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  const chunks: string[] = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(extension) && !excludedNames.has(entry.name)) {
      chunks.push(await readFile(join(dir, entry.name), 'utf8'));
    }
  }

  return chunks.join('\n');
}
