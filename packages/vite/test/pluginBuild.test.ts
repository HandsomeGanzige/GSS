import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build, type CSSModulesOptions, type CSSOptions, type RenderBuiltAssetUrl } from 'vite';
import { semanticAtomicCss } from '../src/plugin.js';

const tempRoots: string[] = [];
type TestCssModulesOptions = CSSModulesOptions & { namedExports?: boolean };

const { getManifestSpy } = vi.hoisted(() => ({ getManifestSpy: vi.fn() }));

vi.mock('@semantic-atomic-css/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@semantic-atomic-css/core')>();

  return {
    ...actual,
    createTransformer(...args: Parameters<typeof actual.createTransformer>) {
      const transformer = actual.createTransformer(...args);
      return {
        ...transformer,
        getManifest() {
          getManifestSpy();
          return transformer.getManifest();
        }
      };
    }
  };
});

describe('semanticAtomicCss build plugin', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('build 默认使用无 prefix 的 compact atomic className 策略', async () => {
    const root = await createBuildFixture('.button {\n  color: red;\n}');

    await runBuild(root);

    const css = await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8');

    expect(css).toMatch(/\.[ab][0-9a-z]{6}\s+\{/);
    expect(css).not.toContain('._color_red');
  });

  it('build 按生产 grammar 精确渲染 base、pseudo/attribute、important 与条件 wrapper', async () => {
    const root = await createBuildFixture(
      [
        '.base { color: rgb(1 2 3 / 40%); }',
        '.hover:hover { background: blue; }',
        '.exact[data-state="open"] { color: green !important; }',
        '@supports (display: grid) { .supports { display: grid; } }',
        '@media (min-width: 600px) { .media { display: grid; } }',
        '@media (min-width: 600px) {',
        '  @supports (display: grid) { .both:hover { color: red; } }',
        '}'
      ].join('\n')
    );

    await runBuild(root, { core: { className: { strategy: 'readable' } } });

    const css = await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8');

    expect(css).toBe(
      [
        '._selector_q0dmug_color_rgb_1_2_3_40 {\n  color: rgb(1 2 3 / 40%);}',
        '._selector_qf5xvc_background_blue:hover {\n  background: blue;}',
        '._selector_4e0slb_color_green_important[data-state="open"] {\n  color: green!important;}',
        '@supports (display: grid){._supports_1gj8cx_selector_q0dmug_display_grid {\n  display: grid;}}',
        '@media (min-width: 600px){._media_1ltocy_selector_q0dmug_display_grid {\n  display: grid;}}',
        '@media (min-width: 600px){@supports (display: grid){._media_1ltocy_supports_1gj8cx_selector_qf5xvc_color_red:hover {\n  color: red;}}}'
      ].join('')
    );
  });

  it.each([
    ['显式 hash', { strategy: 'hash' as const }, /\._[a-z0-9]{8}\s+\{/, '_'],
    ['显式 readable', { strategy: 'readable' as const }, /\._selector_q0dmug_color_red\s+\{/, '_'],
    ['显式 compact prefix', { strategy: 'compact' as const, prefix: 'P' }, /\.P[ab][0-9a-z]{6}\s+\{/, 'P'],
    ['只显式 prefix', { prefix: 'P' }, /\.P[ab][0-9a-z]{6}\s+\{/, 'P']
  ])('build %s 配置覆盖环境默认', async (_name, className, pattern, expectedPrefix) => {
    const root = await createBuildFixture('.button { color: red; }');

    await runBuild(root, { core: { className } });

    const css = await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8');
    expect(css).toMatch(pattern);
    expect(css.match(/\.([^\s{]+)\s+\{/)?.[1]?.startsWith(expectedPrefix)).toBe(true);
    expect(css).toContain(' {\n  color: red;}');
    expect(css).not.toContain('color: red;\n}');
  });

  it('build 使用 descriptor CSS 输出 base、hover 与 focus-visible selector', async () => {
    const root = await createBuildFixture(
      [
        '.button { color: red; }',
        '.button:hover { color: red; }',
        '.button:focus-visible { outline: 2px solid blue; }'
      ].join('\n')
    );

    await runBuild(root, {
      core: {
        className: {
          strategy: 'readable',
          prefix: 'gss-'
        }
      }
    });

    const css = await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8');

    expect(css).toContain('.gss-selector_q0dmug_color_red {');
    expect(css).toContain('.gss-selector_qf5xvc_color_red:hover {');
    expect(css).toContain('.gss-selector_1qzezs_outline_2px_solid_blue:focus-visible {');
    expect(css).not.toContain('__GSS_ANCHOR__');
  });

  it('build generic descriptor 路径消费 pseudo-element mapping、alias fallback 与 list fallback', async () => {
    const root = await createBuildFixture(
      [
        '.before::before { content: ""; color: red; }',
        '.after:after { content: ""; display: block; }',
        '.alias:before { color: red; }',
        '.alias::before { color: blue; }',
        '.fallback::after, .peer { color: green; }'
      ].join('\n'),
      {
        mainJs: [
          "import styles from './Button.module.css';",
          "document.body.setAttribute('data-before', styles.before);",
          "document.body.setAttribute('data-after', styles.after);",
          "document.body.setAttribute('data-alias', styles.alias);",
          "document.body.setAttribute('data-fallback', styles.fallback);"
        ].join('\n')
      }
    );

    await runBuild(root, {
      core: { className: { strategy: 'readable' } },
      manifest: { enabled: true },
      report: { enabled: true }
    }, {
      generateScopedName: 'pseudo_[local]'
    });

    const css = await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8');
    const js = await readBuiltAssets(join(root, 'dist/assets'), '.js');
    const manifest = JSON.parse(await readFile(join(root, 'dist/semantic-atomic-manifest.json'), 'utf8'));
    const report = JSON.parse(await readFile(join(root, 'dist/semantic-atomic-report.json'), 'utf8'));
    const classes = Object.values(manifest.classes) as Array<{
      sourceClassName: string;
      atomicClassNames: string[];
      unsafeReasons?: string[];
    }>;
    const before = classes.find(({ sourceClassName }) => sourceClassName === 'pseudo_before');
    const after = classes.find(({ sourceClassName }) => sourceClassName === 'pseudo_after');
    const alias = classes.find(({ sourceClassName }) => sourceClassName === 'pseudo_alias');
    const fallback = classes.find(({ sourceClassName }) => sourceClassName === 'pseudo_fallback');
    const entries = Object.values(manifest.atomic) as Array<{ selector: { identity: string; css: string } }>;

    expect(before?.atomicClassNames).toHaveLength(2);
    expect(after?.atomicClassNames).toHaveLength(2);
    expect(js).toContain(before?.atomicClassNames[0]);
    expect(js).toContain(after?.atomicClassNames[0]);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selector: expect.objectContaining({ identity: '.__GSS_ANCHOR__::before' }) }),
        expect.objectContaining({ selector: expect.objectContaining({ identity: '.__GSS_ANCHOR__:after' }) })
      ])
    );
    expect(entries.every(({ selector }) => !selector.css.includes(','))).toBe(true);
    expect(alias).toMatchObject({ atomicClassNames: [], unsafeReasons: ['pseudo-element'] });
    expect(fallback).toMatchObject({ atomicClassNames: [], unsafeReasons: ['selector-list'] });
    expect(css).toContain('.pseudo_alias:before');
    expect(css).toContain('.pseudo_alias::before');
    expect(css).toContain('.pseudo_fallback::after, .pseudo_peer');
    expect(report.analysis.risk.unsafeReasonDistribution).toMatchObject({
      'pseudo-element': 2,
      'selector-list': 1
    });
  });

  it('build 消费 Core 的单-arm selector-list descriptor，并完整保留 unsafe mixed list', async () => {
    const root = await createBuildFixture(
      [
        '.a, .b { color: red; }',
        '.a:hover, .b:hover { background: blue; }',
        '.a[data-ready], [data-ready].b { border-color: green; }',
        '.safe, .parent .unsafe { margin: 4px; }',
        '.safe { padding: 8px; }'
      ].join('\n'),
      {
        mainJs: [
          "import styles from './Button.module.css';",
          "document.body.setAttribute('data-a', styles.a);",
          "document.body.setAttribute('data-b', styles.b);",
          "document.body.setAttribute('data-safe', styles.safe);"
        ].join('\n')
      }
    );

    await runBuild(root, {
      core: { className: { strategy: 'readable' } },
      manifest: { enabled: true },
      report: { enabled: true }
    }, {
      generateScopedName: 'list_[local]'
    });

    const css = await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8');
    const js = await readBuiltAssets(join(root, 'dist/assets'), '.js');
    const manifest = JSON.parse(await readFile(join(root, 'dist/semantic-atomic-manifest.json'), 'utf8'));
    const report = JSON.parse(await readFile(join(root, 'dist/semantic-atomic-report.json'), 'utf8'));
    const classes = Object.values(manifest.classes) as Array<{
      sourceClassName: string;
      atomicClassNames: string[];
      unsafeReasons?: string[];
    }>;
    const a = classes.find(({ sourceClassName }) => sourceClassName === 'list_a');
    const b = classes.find(({ sourceClassName }) => sourceClassName === 'list_b');
    const safe = classes.find(({ sourceClassName }) => sourceClassName === 'list_safe');

    expect(a?.atomicClassNames).toContain('_selector_q0dmug_color_red');
    expect(b?.atomicClassNames).toContain('_selector_q0dmug_color_red');
    expect(a?.atomicClassNames).toContain('_selector_qf5xvc_background_blue');
    expect(b?.atomicClassNames).toContain('_selector_qf5xvc_background_blue');
    expect(js).toContain('_selector_q0dmug_color_red');
    expect(css).toContain('._selector_q0dmug_color_red {');
    expect(css).toContain('._selector_qf5xvc_background_blue:hover {');
    expect(
      Object.values(manifest.atomic).every(
        (entry) => !(entry as { selector: { css: string } }).selector.css.includes(',')
      )
    ).toBe(true);
    expect(safe).toMatchObject({ atomicClassNames: [], unsafeReasons: ['selector-list'] });
    expect(css).toMatch(/\.[^{,]+,\s*\.[^{]+\s\.[^{]+\s*\{/u);
    expect(report.analysis.risk.unsafeReasonDistribution).toMatchObject({ 'selector-list': 1 });
  });

  it('build 将 url() 关联 class 整体保留，并在聚合 CSS 中解析本地资源', async () => {
    const root = await createBuildFixture(
      '.hero { color: red; background: url("./mark.svg#asset-fragment") no-repeat; }',
      {
        extraFiles: {
          'mark.svg': '<svg xmlns="http://www.w3.org/2000/svg"><circle id="asset-fragment" r="4" /></svg>'
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
    expect(css).toContain(`url("./${assetNames[0]}#asset-fragment")`);
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
          generateScopedName: 'preprocessor_[name]__[local]'
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

    expect(js).toContain('preprocessor_Button-module__button');
    expect(js).toContain('preprocessor_Panel-module__panel');
    expect(js).toContain('_color_0f766e');
    expect(js).not.toContain('_background_eff6ff');
    expect(css).toContain('padding: 10px;');
    expect(css).toContain('background: #eff6ff;');
    expect(css).toContain('border-radius: 7px;');
    expect(css).toContain('.preprocessor_Panel-module__panel .preprocessor_Panel-module__child');
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

  it('build 保留 important 与 supports/media wrapper', async () => {
    const root = await createBuildFixture(
      [
        '.button { color: red !important; }',
        '@supports (display: grid) {',
        '  .button:focus-visible { display: grid; }',
        '}',
        '@media (min-width: 600px) {',
        '  .button:hover { color: blue; }',
        '}'
      ].join('\n')
    );

    await runBuild(root, { core: { className: { strategy: 'readable' } } });

    const css = await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8');

    expect(css).toContain('color: red!important;}');
    expect(css).toContain('@supports (display: grid){');
    expect(css).toContain(':focus-visible {');
    expect(css).toContain('@media (min-width: 600px){');
    expect(css).toContain(':hover {');
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

    const options = {
      core: {
        className: {
          strategy: 'compact' as const
        }
      },
      manifest: { enabled: true },
      report: { enabled: true }
    };

    await runBuild(root, options);

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
    expect(Object.keys(manifest.atomic).every((className) => /^[ab][0-9a-z]{6}$/.test(className))).toBe(true);

    await writeFile(
      join(root, 'src/main.js'),
      [
        "import alpha from './Alpha.module.css';",
        "import button from './Button.module.css';",
        "document.body.setAttribute('data-alpha', alpha.alpha);",
        "document.body.setAttribute('data-button', button.button);"
      ].join('\n')
    );
    await runBuild(root, options);

    expect(await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8')).toBe(css);
    expect(JSON.parse(await readFile(join(root, 'dist/semantic-atomic-manifest.json'), 'utf8'))).toEqual(manifest);
    expect(JSON.parse(await readFile(join(root, 'dist/semantic-atomic-report.json'), 'utf8'))).toEqual(report);
  });

  it('显式开启 manifest/report 后保留基础 source location', async () => {
    const root = await createBuildFixture(
      [
        '.button {',
        '  color: red;',
        '}',
        '',
        '.button[data-state^="open"] {',
        '  color: blue;',
        '}',
        '',
        '.independent {',
        '  padding: 8px;',
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
      className: string;
      selector: { identity: string; css: string };
      context: Record<string, unknown>;
      declaration: { source?: { id: string; line?: number; column?: number } };
      sources: Array<{ id: string; line?: number; column?: number }>;
    };
    const classEntry = Object.values(manifest.classes).find((entry) =>
      String((entry as { sourceClassName?: string }).sourceClassName).includes('button')
    ) as { id: string; sourceClassName: string };
    const diagnostic = report.diagnostics[0] as {
      code: string;
      reason: string;
      source?: { id: string; line?: number; column?: number };
    };

    expect(atomicEntry.declaration.source).toMatchObject({
      line: 10,
      column: 3
    });
    expect(atomicEntry.sources[0]).toMatchObject({
      line: 10,
      column: 3
    });
    expect(atomicEntry.sources[0]?.id).toMatch(/Button\.module\.css$/);
    expect(atomicEntry.selector).toEqual({
      identity: '.__GSS_ANCHOR__',
      css: `.${atomicEntry.className}`
    });
    expect(atomicEntry.context).not.toHaveProperty('pseudo');
    expect(await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8')).toContain(
      `${atomicEntry.selector.css} {`
    );
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
    expect(report.analysis.size).toMatchObject({
      afterRawCssBytes: Buffer.byteLength(await readFile(join(root, 'dist/assets/semantic-atomic.css'))),
      afterGzipCssBytes: gzipSync(await readFile(join(root, 'dist/assets/semantic-atomic.css'))).byteLength,
      afterBrotliCssBytes: brotliCompressSync(await readFile(join(root, 'dist/assets/semantic-atomic.css'))).byteLength
    });
  });

  it('build metadata 按配置惰性读取，并让 manifest asset 与 report 共用一次 Core snapshot', async () => {
    const root = await createBuildFixture('.button { color: red; }');

    getManifestSpy.mockClear();
    await runBuild(root);
    expect(getManifestSpy).not.toHaveBeenCalled();

    getManifestSpy.mockClear();
    await runBuild(root, { manifest: { enabled: true } });
    expect(getManifestSpy).toHaveBeenCalledTimes(1);
    const manifestOnly = await readFile(join(root, 'dist/semantic-atomic-manifest.json'), 'utf8');
    expect(await readdir(join(root, 'dist'))).not.toContain('semantic-atomic-report.json');

    getManifestSpy.mockClear();
    await runBuild(root, { report: { enabled: true } });
    expect(getManifestSpy).toHaveBeenCalledTimes(1);
    const reportOnly = await readFile(join(root, 'dist/semantic-atomic-report.json'), 'utf8');
    expect(await readdir(join(root, 'dist'))).not.toContain('semantic-atomic-manifest.json');

    getManifestSpy.mockClear();
    await runBuild(root, {
      manifest: { enabled: true },
      report: { enabled: true }
    });
    expect(getManifestSpy).toHaveBeenCalledTimes(1);
    expect(await readFile(join(root, 'dist/semantic-atomic-manifest.json'), 'utf8')).toBe(manifestOnly);
    expect(await readFile(join(root, 'dist/semantic-atomic-report.json'), 'utf8')).toBe(reportOnly);
  });

  it('build 透传 eligible attribute descriptor，并对顺序风险整类 fallback', async () => {
    const root = await createBuildFixture(
      [
        '.presence[data-ready] { border-color: red; }',
        '.exact[data-state="open"] { color: green; }',
        '[data-tone="warm"].before { background: gold; }',
        '.eligible { opacity: 0.8; }',
        '.orderRisk[data-state] { color: red; }',
        '.orderRisk:hover { color: blue; }',
        '.orderRisk { padding: 4px; }'
      ].join('\n'),
      {
        mainJs: [
          "import styles from './Button.module.css';",
          'document.body.setAttribute(\'data-classes\', [',
          '  styles.presence,',
          '  styles.exact,',
          '  styles.before,',
          '  styles.eligible,',
          '  styles.orderRisk',
          "].join(' '));"
        ].join('\n')
      }
    );

    await runBuild(
      root,
      {
        core: { className: { strategy: 'readable' } },
        manifest: { enabled: true },
        report: { enabled: true }
      },
      { generateScopedName: 'native_[local]' }
    );

    const css = await readFile(join(root, 'dist/assets/semantic-atomic.css'), 'utf8');
    const js = await readBuiltAssets(join(root, 'dist/assets'), '.js');
    const manifest = JSON.parse(await readFile(join(root, 'dist/semantic-atomic-manifest.json'), 'utf8')) as {
      atomic: Record<
        string,
        {
          selector: { identity: string; css: string };
          declaration: { prop: string; value: string };
        }
      >;
      classes: Record<
        string,
        {
          sourceClassName: string;
          resolvedClassName: string;
          atomicClassNames: string[];
          unsafeReasons?: string[];
        }
      >;
    };
    const report = JSON.parse(await readFile(join(root, 'dist/semantic-atomic-report.json'), 'utf8'));
    const orderRiskClass = Object.values(manifest.classes).find((entry) =>
      entry.sourceClassName.includes('orderRisk')
    );

    expect(js).toContain('native_presence _selector_jyr83m_border-color_red');
    expect(js).toContain('native_exact _selector_4e0slb_color_green');
    expect(js).toContain('native_before _selector_1wtkk6_background_gold');
    expect(js).toContain('native_eligible _selector_q0dmug_opacity_0_8');
    expect(manifest.atomic['_selector_jyr83m_border-color_red']?.selector).toEqual({
      identity: '.__GSS_ANCHOR__[data-ready]',
      css: '._selector_jyr83m_border-color_red[data-ready]'
    });
    expect(manifest.atomic._selector_4e0slb_color_green?.selector).toEqual({
      identity: '.__GSS_ANCHOR__[data-state="open"]',
      css: '._selector_4e0slb_color_green[data-state="open"]'
    });
    expect(manifest.atomic._selector_1wtkk6_background_gold?.selector).toEqual({
      identity: '[data-tone="warm"].__GSS_ANCHOR__',
      css: '[data-tone="warm"]._selector_1wtkk6_background_gold'
    });
    expect(css).toContain('._selector_jyr83m_border-color_red[data-ready] {');
    expect(css).toContain('._selector_4e0slb_color_green[data-state="open"] {');
    expect(css).toContain('[data-tone="warm"]._selector_1wtkk6_background_gold {');
    expect(css).not.toContain('.native_presence[data-ready]');
    expect(css).not.toContain('.native_exact[data-state="open"]');
    expect(css).not.toContain('[data-tone="warm"].native_before');
    expect(orderRiskClass).toMatchObject({
      resolvedClassName: 'native_orderRisk',
      atomicClassNames: [],
      unsafeReasons: ['attribute-cascade-order']
    });
    const atomicDeclarations = Object.values(manifest.atomic).map(
      ({ declaration }) => `${declaration.prop}:${declaration.value}`
    );
    expect(atomicDeclarations).not.toContain('color:red');
    expect(atomicDeclarations).not.toContain('color:blue');
    expect(atomicDeclarations).not.toContain('padding:4px');
    expect(js).toContain('native_orderRisk');
    expect(js).not.toMatch(/native_orderRisk _selector_/);
    expect(css).toContain('.native_orderRisk[data-state]');
    expect(css).toContain('.native_orderRisk:hover');
    expect(css).toContain('.native_orderRisk {');
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'unsafe-selector',
        reason: 'attribute-cascade-order',
        sourceClassName: expect.stringContaining('orderRisk')
      })
    );
    expect(report.diagnostics).not.toContainEqual(
      expect.objectContaining({ reason: 'attribute-selector' })
    );
    expect(report.analysis).toMatchObject({
      health: { status: 'risky' },
      risk: {
        unsafeReasonDistribution: { 'attribute-cascade-order': 1 },
        highRiskFiles: [expect.objectContaining({ unsafeRules: 1 })]
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
        selectorIdentity: '.__GSS_ANCHOR__',
        properties: ['color']
      }),
      expect.objectContaining({
        kind: 'shorthand-longhand',
        selectorIdentity: '.__GSS_ANCHOR__',
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

    expect(css).toContain('._selector_q0dmug_color_red');
    expect(css).toContain('.ant-btn');
    expect(css).toContain('color: blue;');
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'unsafe-selector',
        reason: 'non-exported-class'
      })
    );
  });

  it('对当前未实现的 namedExports、strict mode 和 Lightning CSS 显式失败', async () => {
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

    await expect(runBuild(root, {}, undefined, { transformer: 'lightningcss' })).rejects.toThrow(
      'vite.css.transformer.lightningcss'
    );
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
    expect(css).toContain('._selector_q0dmug_color_red');
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
  transformer?: CSSOptions['transformer'];
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
      preprocessorOptions: buildOptions.preprocessorOptions,
      transformer: buildOptions.transformer
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
