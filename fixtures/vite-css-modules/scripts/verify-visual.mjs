import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = path.join(fixtureRoot, 'node_modules/.bin/vite');
const host = '127.0.0.1';
const timeoutMs = 30_000;
const rectTolerance = 1;
const chromeExecutable = process.env.GSS_VISUAL_CHROME_EXECUTABLE;
const viewports = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'narrow', width: 520, height: 900 }
];

const baseCases = [
  {
    id: 'cascade-active',
    properties: ['display', 'backgroundColor', 'borderTopColor', 'color', 'fontWeight', 'borderRadius'],
    rect: true,
    expected: {
      backgroundColor: 'rgb(236, 253, 245)',
      borderTopColor: 'rgb(94, 234, 212)',
      color: 'rgb(15, 118, 110)'
    }
  },
  {
    id: 'responsive-stack',
    properties: ['display', 'alignItems', 'flexDirection', 'backgroundColor'],
    rect: true,
    expectedByViewport: {
      desktop: { alignItems: 'center', flexDirection: 'row' },
      narrow: { alignItems: 'flex-start', flexDirection: 'column' }
    }
  },
  {
    id: 'order-box',
    properties: ['borderTopColor', 'borderLeftColor', 'borderTopWidth', 'borderLeftWidth'],
    expected: {
      borderTopColor: 'rgb(254, 202, 202)',
      borderLeftColor: 'rgb(15, 118, 110)'
    }
  },
  {
    id: 'important-box',
    properties: ['color', 'backgroundColor', 'fontWeight'],
    expected: { color: 'rgb(153, 27, 27)' }
  },
  {
    id: 'custom-token',
    properties: ['color', 'backgroundColor', 'borderTopColor'],
    expected: { color: 'rgb(15, 118, 110)' }
  },
  {
    id: 'supports-grid',
    properties: ['display', 'gridTemplateColumns', 'gap'],
    expected: { display: 'grid' }
  },
  {
    id: 'dashed-token',
    properties: ['color', 'backgroundColor', 'borderTopColor', 'fontWeight'],
    expected: {
      color: 'rgb(29, 78, 216)',
      backgroundColor: 'rgb(239, 246, 255)',
      borderTopColor: 'rgb(191, 219, 254)'
    }
  },
  {
    id: 'camel-token',
    properties: ['color', 'backgroundColor', 'borderTopColor', 'fontWeight'],
    expected: {
      color: 'rgb(4, 120, 87)',
      backgroundColor: 'rgb(236, 253, 245)',
      borderTopColor: 'rgb(153, 246, 228)'
    }
  },
  {
    id: 'fallback-child',
    properties: ['boxShadow', 'backgroundColor', 'borderTopColor'],
    expected: { boxShadow: 'rgba(15, 23, 42, 0.12) 0px 12px 22px 0px' }
  },
  {
    id: 'compound-chip',
    properties: ['color', 'backgroundColor', 'borderTopColor'],
    expected: {
      color: 'rgb(146, 64, 14)',
      backgroundColor: 'rgb(255, 247, 237)',
      borderTopColor: 'rgb(254, 215, 170)'
    }
  },
  {
    id: 'attribute-state-risk',
    properties: ['color', 'backgroundColor', 'fontWeight'],
    expected: {
      color: 'rgb(153, 27, 27)',
      backgroundColor: 'rgb(254, 226, 226)'
    }
  },
  {
    id: 'disabled-button',
    properties: ['color', 'backgroundColor', 'cursor', 'fontWeight'],
    expected: {
      color: 'rgb(148, 163, 184)',
      backgroundColor: 'rgb(241, 245, 249)',
      cursor: 'not-allowed',
      fontWeight: '800'
    }
  },
  {
    id: 'pseudo-marker',
    pseudo: '::before',
    properties: ['content', 'backgroundColor', 'width'],
    expected: {
      content: '""',
      backgroundColor: 'rgb(15, 118, 110)',
      width: '4px'
    }
  }
];

const baseHoverCases = [
  {
    id: 'hover-button',
    properties: ['backgroundColor', 'borderTopColor', 'cursor', 'fontWeight'],
    expected: {
      backgroundColor: 'rgb(248, 250, 252)',
      borderTopColor: 'rgb(148, 163, 184)',
      fontWeight: '800'
    }
  }
];

const baseFocusCases = [
  {
    id: 'focus-button',
    properties: ['outlineColor', 'outlineStyle', 'outlineWidth', 'outlineOffset', 'fontWeight'],
    expected: {
      outlineColor: 'rgb(153, 246, 228)',
      outlineStyle: 'solid',
      outlineWidth: '3px',
      fontWeight: '800'
    }
  }
];

const preprocessorCases = [
  {
    id: 'scss-asset',
    properties: ['color', 'backgroundColor', 'paddingTop', 'borderTopColor', 'borderRadius'],
    expected: { backgroundColor: 'rgb(204, 251, 241)' }
  },
  {
    id: 'scss-safe',
    properties: ['color', 'backgroundColor', 'paddingTop', 'outlineColor', 'outlineWidth'],
    expected: { color: 'rgb(15, 118, 110)' }
  },
  {
    id: 'less-safe',
    properties: ['color', 'backgroundColor', 'borderRadius', 'gap'],
    expected: { borderRadius: '9px' }
  },
  {
    id: 'less-child',
    properties: ['fontWeight'],
    expected: { fontWeight: '700' }
  }
];

/** 运行选定 suite 的 semantic/native dev、preview 与 HMR 视觉验收。 */
async function main() {
  const selectedSuites = resolveSuites(process.argv.slice(2));
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'gss-vite-visual-'));

  try {
    for (const suite of selectedSuites) {
      await compareDev(suite);
      await comparePreview(suite, tempRoot);
    }

    if (selectedSuites.includes('preprocessor')) {
      await verifyPartialReload(tempRoot);
    }
    console.log(`Vite CSS Modules visual 验收通过: ${selectedSuites.join(', ')}`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

/** 解析 --suite base|preprocessor|all，默认运行全部。 */
function resolveSuites(args) {
  const suiteIndex = args.indexOf('--suite');
  const suite = suiteIndex === -1 ? 'all' : args[suiteIndex + 1];

  if (suite === 'all') return ['base', 'preprocessor'];
  if (suite === 'base' || suite === 'preprocessor') return [suite];
  throw new Error(`不支持的 visual suite: ${suite}`);
}

async function compareDev(suite) {
  const [semanticPort, nativePort] = await allocatePorts(2);
  const semantic = await startVite(`${suite}-semantic-dev`, fixtureRoot, suite, 'semantic', [
    '--host',
    host,
    '--port',
    String(semanticPort),
    '--strictPort'
  ]);
  const native = await startVite(`${suite}-native-dev`, fixtureRoot, suite, 'native', [
    '--host',
    host,
    '--port',
    String(nativePort),
    '--strictPort'
  ]);

  try {
    await compareServers(`${suite}/dev`, suite, urlFor(semanticPort), urlFor(nativePort));
  } finally {
    await Promise.all([stopProcess(semantic), stopProcess(native)]);
  }
}

async function comparePreview(suite, tempRoot) {
  const semanticOutDir = path.join(tempRoot, `${suite}-semantic-dist`);
  const nativeOutDir = path.join(tempRoot, `${suite}-native-dist`);
  await runVite(`${suite}-semantic-build`, fixtureRoot, suite, 'semantic', [
    'build',
    '--outDir',
    semanticOutDir,
    '--emptyOutDir'
  ]);
  await runVite(`${suite}-native-build`, fixtureRoot, suite, 'native', [
    'build',
    '--outDir',
    nativeOutDir,
    '--emptyOutDir'
  ]);

  const [semanticPort, nativePort] = await allocatePorts(2);
  const semantic = await startVite(`${suite}-semantic-preview`, fixtureRoot, suite, 'semantic', [
    'preview',
    '--host',
    host,
    '--port',
    String(semanticPort),
    '--strictPort',
    '--outDir',
    semanticOutDir
  ]);
  const native = await startVite(`${suite}-native-preview`, fixtureRoot, suite, 'native', [
    'preview',
    '--host',
    host,
    '--port',
    String(nativePort),
    '--strictPort',
    '--outDir',
    nativeOutDir
  ]);

  try {
    await compareServers(`${suite}/preview`, suite, urlFor(semanticPort), urlFor(nativePort));
  } finally {
    await Promise.all([stopProcess(semantic), stopProcess(native)]);
  }
}

/** 在临时 fixture 中修改 Sass partial，确认 full reload 后使用新结果。 */
async function verifyPartialReload(tempRoot) {
  const tempFixture = path.join(tempRoot, 'hmr-fixture');
  await cp(fixtureRoot, tempFixture, {
    recursive: true,
    filter(source) {
      return !source.includes(`${path.sep}node_modules`) && !source.includes(`${path.sep}dist`);
    }
  });
  // 临时副本离开 workspace 后不能继承仓库根 tsconfig，只保留 Vite 转译 TSX 所需的最小配置。
  await writeFile(
    path.join(tempFixture, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          isolatedModules: true,
          jsx: 'react-jsx'
        }
      },
      null,
      2
    )}\n`
  );
  await symlink(path.join(fixtureRoot, 'node_modules'), path.join(tempFixture, 'node_modules'), 'dir');

  const port = await allocatePort();
  const server = await startVite('preprocessor-semantic-hmr', tempFixture, 'preprocessor', 'semantic', [
    '--host',
    host,
    '--port',
    String(port),
    '--strictPort'
  ]);
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let loadCount = 0;
  page.on('load', () => {
    loadCount += 1;
  });

  try {
    await page.goto(urlFor(port), { waitUntil: 'networkidle' });
    try {
      await page.waitForSelector('[data-gss-case="scss-safe"]', { timeout: 5_000 });
    } catch (error) {
      throw new Error(
        `临时 HMR fixture 未渲染 preprocessor suite\nurl=${page.url()}\nhtml=${await page.content()}\nserver=${server.output.join('')}\n${formatError(error)}`
      );
    }
    await assertComputedColor(page, 'scss-safe', 'rgb(15, 118, 110)');
    // 页面初次编译完成不代表 chokidar 已建立全部 partial watch，留出短窗口避免丢失紧随其后的写入。
    await delay(750);

    const tokenFile = path.join(tempFixture, 'suites/preprocessor/src/cases/_tokens.scss');
    const source = await readFile(tokenFile, 'utf8');
    assert(source.includes('#0f766e'), 'partial HMR fixture 缺少预期的初始颜色');
    await writeFile(tokenFile, source.replace('#0f766e', '#7c3aed'));

    try {
      await page.waitForFunction(
        () => {
          const element = document.querySelector('[data-gss-case="scss-safe"]');
          return element && getComputedStyle(element).color === 'rgb(124, 58, 237)';
        },
        undefined,
        { timeout: timeoutMs }
      );
    } catch (error) {
      const currentColor = await page
        .locator('[data-gss-case="scss-safe"]')
        .evaluate((element) => getComputedStyle(element).color);
      throw new Error(
        `partial HMR 超时 currentColor=${currentColor} loadCount=${loadCount}\nserver=${server.output.join('')}\n${formatError(error)}`
      );
    }
    assert(loadCount >= 2, 'partial 更新应触发浏览器 full reload');
  } finally {
    await browser.close();
    await stopProcess(server);
  }
}

/** 在全部视口比较 semantic/native 的 class 增强与 computed style。 */
async function compareServers(label, suite, semanticUrl, nativeUrl) {
  const browser = await launchBrowser();

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const semanticPage = await context.newPage();
      const nativePage = await context.newPage();
      const browserErrors = [];
      captureBrowserErrors(semanticPage, 'semantic', browserErrors);
      captureBrowserErrors(nativePage, 'native', browserErrors);

      try {
        await Promise.all([
          semanticPage.goto(semanticUrl, { waitUntil: 'networkidle' }),
          nativePage.goto(nativeUrl, { waitUntil: 'networkidle' })
        ]);
        await assertSemanticClassExpansion(label, suite, semanticPage, nativePage);

        if (suite === 'base') {
          await compareCases(label, viewport, 'base', semanticPage, nativePage, baseCases);
          await Promise.all([
            semanticPage.locator('[data-gss-case="hover-button"]').hover(),
            nativePage.locator('[data-gss-case="hover-button"]').hover()
          ]);
          await compareCases(label, viewport, 'hover', semanticPage, nativePage, baseHoverCases);
          await Promise.all([
            semanticPage.locator('[data-gss-case="focus-button"]').focus(),
            nativePage.locator('[data-gss-case="focus-button"]').focus()
          ]);
          await compareCases(label, viewport, 'focus', semanticPage, nativePage, baseFocusCases);
        } else {
          await compareCases(label, viewport, 'base', semanticPage, nativePage, preprocessorCases);
          await Promise.all([
            semanticPage.locator('[data-gss-case="scss-safe"]').focus(),
            nativePage.locator('[data-gss-case="scss-safe"]').focus()
          ]);
          await compareCases(label, viewport, 'focus', semanticPage, nativePage, preprocessorCases);
        }

        assert(browserErrors.length === 0, `${label}/${viewport.name} 浏览器错误\n${browserErrors.join('\n')}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

/** semantic token 必须比 native token 多出 atomic class。 */
async function assertSemanticClassExpansion(label, suite, semanticPage, nativePage) {
  const id = suite === 'base' ? 'cascade-active' : 'scss-safe';
  const selector = `[data-gss-case="${id}"]`;
  const [semanticClassName, nativeClassName] = await Promise.all([
    semanticPage.locator(selector).evaluate((element) => element.className),
    nativePage.locator(selector).evaluate((element) => element.className)
  ]);
  const semanticCount = splitClassName(semanticClassName).length;
  const nativeCount = splitClassName(nativeClassName).length;
  assert(
    semanticCount > nativeCount,
    `${label}: semantic class token 未体现 atomic 增强\nsemantic=${semanticClassName}\nnative=${nativeClassName}`
  );
}

async function compareCases(label, viewport, state, semanticPage, nativePage, cases) {
  const [semantic, native] = await Promise.all([
    collectSnapshots(semanticPage, cases),
    collectSnapshots(nativePage, cases)
  ]);

  assertExpectedSnapshots(label, viewport, state, semantic, cases);
  assertExpectedSnapshots(label, viewport, state, native, cases);

  for (const [key, semanticValue] of Object.entries(semantic)) {
    const nativeValue = native[key];
    assert(nativeValue, `${label}/${viewport.name}/${state}: native 缺少 ${key}`);

    for (const [property, value] of Object.entries(semanticValue.styles)) {
      assert(
        nativeValue.styles[property] === value,
        `${label}/${viewport.name}/${state}/${key}: ${property} 不一致 semantic=${value} native=${nativeValue.styles[property]}`
      );
    }

    if (semanticValue.rect && nativeValue.rect) {
      for (const property of ['x', 'y', 'width', 'height']) {
        const difference = Math.abs(semanticValue.rect[property] - nativeValue.rect[property]);
        assert(difference <= rectTolerance, `${label}/${viewport.name}/${state}/${key}: ${property} 偏差 ${difference}`);
      }
    }
  }
}

async function collectSnapshots(page, cases) {
  return page.evaluate((caseSpecs) => {
    const result = {};

    for (const spec of caseSpecs) {
      const element = document.querySelector(`[data-gss-case="${spec.id}"]`);
      if (!element) throw new Error(`缺少验收元素: ${spec.id}`);
      const style = getComputedStyle(element, spec.pseudo ?? null);
      const rect = spec.rect ? element.getBoundingClientRect() : undefined;
      result[spec.pseudo ? `${spec.id}${spec.pseudo}` : spec.id] = {
        styles: Object.fromEntries(spec.properties.map((property) => [property, style[property]])),
        rect: rect
          ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          : undefined
      };
    }

    return result;
  }, cases);
}

function assertExpectedSnapshots(label, viewport, state, snapshots, cases) {
  for (const spec of cases) {
    const key = spec.pseudo ? `${spec.id}${spec.pseudo}` : spec.id;
    const expected = { ...(spec.expected ?? {}), ...(spec.expectedByViewport?.[viewport.name] ?? {}) };

    for (const [property, value] of Object.entries(expected)) {
      const actual = snapshots[key]?.styles[property];
      assert(actual === value, `${label}/${viewport.name}/${state}/${key}: ${property} 期望 ${value}，实际 ${actual}`);
    }
  }
}

function captureBrowserErrors(page, mode, errors) {
  page.on('pageerror', (error) => errors.push(`${mode} pageerror: ${formatError(error)}`));
  page.on('response', (response) => {
    if (response.status() >= 400 && !new URL(response.url()).pathname.endsWith('/favicon.ico')) {
      errors.push(`${mode} HTTP ${response.status()}: ${response.url()}`);
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      errors.push(`${mode} console: ${message.text()}`);
    }
  });
}

async function assertComputedColor(page, id, expected) {
  const color = await page.locator(`[data-gss-case="${id}"]`).evaluate((element) => getComputedStyle(element).color);
  assert(color === expected, `${id} color 期望 ${expected}，实际 ${color}`);
}

async function launchBrowser() {
  try {
    return await chromium.launch(
      chromeExecutable ? { headless: true, executablePath: chromeExecutable } : { headless: true, channel: 'chrome' }
    );
  } catch (error) {
    throw new Error(`无法启动 Chrome，可通过 GSS_VISUAL_CHROME_EXECUTABLE 指定路径。\n${formatError(error)}`);
  }
}

async function startVite(label, cwd, suite, mode, args) {
  const processRef = startProcess(label, cwd, suite, mode, args);
  const portIndex = args.indexOf('--port');
  await waitForHttp(urlFor(Number(args[portIndex + 1])), processRef);
  return processRef;
}

async function runVite(label, cwd, suite, mode, args) {
  const processRef = startProcess(label, cwd, suite, mode, args);
  const [code, signal] = await once(processRef.child, 'exit');

  if (code !== 0) {
    throw new Error(`${label} 失败 code=${code ?? 'null'} signal=${signal ?? 'null'}\n${processRef.output.join('')}`);
  }
}

function startProcess(label, cwd, suite, mode, args) {
  const child = spawn(viteBin, args, {
    cwd,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      GSS_FIXTURE_SUITE: suite,
      GSS_FIXTURE_CSS_MODE: mode
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const output = [];
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => output.push(chunk));
  child.stderr.on('data', (chunk) => output.push(chunk));
  return { label, child, output };
}

async function waitForHttp(url, processRef) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (processRef.child.exitCode !== null) {
      throw new Error(`${processRef.label} 启动前退出\n${processRef.output.join('')}`);
    }

    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) return;
    } catch {
      // 服务尚未 ready。
    }

    await delay(200);
  }

  throw new Error(`${processRef.label} 启动超时\n${processRef.output.join('')}`);
}

async function stopProcess(processRef) {
  if (processRef.child.exitCode !== null) return;
  processRef.child.kill('SIGTERM');
  const result = await Promise.race([once(processRef.child, 'exit'), delay(3_000).then(() => 'timeout')]);

  if (result === 'timeout' && processRef.child.exitCode === null) {
    processRef.child.kill('SIGKILL');
    await once(processRef.child, 'exit');
  }
}

async function allocatePorts(count) {
  const ports = [];
  for (let index = 0; index < count; index += 1) ports.push(await allocatePort());
  return ports;
}

async function allocatePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (!address || typeof address === 'string') throw new Error('无法分配端口');
  return address.port;
}

function splitClassName(value) {
  return String(value)
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

function urlFor(port) {
  return `http://${host}:${port}/`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function formatError(error) {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

await main();
