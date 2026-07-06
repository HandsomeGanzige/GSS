import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { semanticAtomicCss } from '../src/plugin.js';

const tempRoots: string[] = [];

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
    expect(classEntry).toMatchObject({
      sourceClassName: 'button'
    });
    expect(classEntry.id).toMatch(/Button\.module\.css$/);
    expect(diagnostic).toMatchObject({
      code: 'unsafe-selector',
      reason: 'attribute-selector'
    });
    expect(diagnostic.source).toMatchObject({
      line: 5,
      column: 1
    });
  });
});

/** 创建最小 Vite build fixture。 */
async function createBuildFixture(css: string): Promise<string> {
  const root = await mkdtemp(join(process.cwd(), '.tmp-vite-build-'));
  const srcDir = join(root, 'src');
  tempRoots.push(root);
  await mkdir(srcDir, { recursive: true });
  await writeFile(join(root, 'index.html'), '<script type="module" src="/src/main.js"></script>');
  await writeFile(
    join(srcDir, 'main.js'),
    [
      "import styles from './Button.module.css';",
      "document.body.setAttribute('data-class-name', styles.button);"
    ].join('\n')
  );
  await writeFile(join(srcDir, 'Button.module.css'), css);
  return root;
}

/** 运行带 GSS adapter 的 Vite build。 */
async function runBuild(root: string, options: Parameters<typeof semanticAtomicCss>[0] = {}): Promise<void> {
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [semanticAtomicCss(options)],
    build: {
      outDir: join(root, 'dist'),
      emptyOutDir: true
    }
  });
}
