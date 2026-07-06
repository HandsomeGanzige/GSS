import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const fixturePackage = 'playground-vite-css-modules-acceptance';
const artifactDir = path.join(root, 'playground/vite-css-modules-acceptance/dist/visual-artifacts');
const serverHost = '127.0.0.1';
const requestTimeoutMs = 30_000;
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
    expected: {
      color: 'rgb(153, 27, 27)'
    }
  },
  {
    id: 'custom-token',
    properties: ['color', 'backgroundColor', 'borderTopColor'],
    expected: {
      color: 'rgb(15, 118, 110)'
    }
  },
  {
    id: 'supports-grid',
    properties: ['display', 'gridTemplateColumns', 'gap'],
    expected: {
      display: 'grid'
    }
  },
  {
    id: 'phase-three-dashed',
    properties: ['color', 'backgroundColor', 'borderTopColor', 'fontWeight'],
    expected: {
      color: 'rgb(29, 78, 216)',
      backgroundColor: 'rgb(239, 246, 255)',
      borderTopColor: 'rgb(191, 219, 254)'
    }
  },
  {
    id: 'phase-three-camel',
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
    expected: {
      boxShadow: 'rgba(15, 23, 42, 0.12) 0px 12px 22px 0px'
    }
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
    properties: ['color', 'backgroundColor', 'cursor'],
    expected: {
      color: 'rgb(148, 163, 184)',
      backgroundColor: 'rgb(241, 245, 249)',
      cursor: 'not-allowed'
    }
  }
];

const pseudoCases = [
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

const hoverCases = [
  {
    id: 'hover-button',
    properties: ['backgroundColor', 'borderTopColor', 'cursor'],
    expected: {
      backgroundColor: 'rgb(248, 250, 252)',
      borderTopColor: 'rgb(148, 163, 184)'
    }
  }
];

const focusCases = [
  {
    id: 'focus-button',
    properties: ['outlineColor', 'outlineStyle', 'outlineWidth', 'outlineOffset'],
    expected: {
      outlineColor: 'rgb(153, 246, 228)',
      outlineStyle: 'solid',
      outlineWidth: '3px'
    }
  }
];

/** 运行 Phase 3 浏览器级 semantic/native computed style 对照验收。 */
async function main() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'gss-phase3-visual-'));

  try {
    await runDevComparison();
    await runPreviewComparison(tempRoot);
    console.log('Phase 3 Vite adapter visual 验收通过');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

/** 对比 dev server 下 semantic/native 的真实渲染。 */
async function runDevComparison() {
  const [semanticPort, nativePort] = await allocatePorts(2);
  const semantic = await startDevServer('semantic', semanticPort);
  const native = await startDevServer('native', nativePort);

  try {
    await compareServerPair('dev', urlFor(semanticPort), urlFor(nativePort));
  } finally {
    await Promise.all([stopProcess(semantic), stopProcess(native)]);
  }
}

/** 对比 build preview 下 semantic/native 的真实渲染。 */
async function runPreviewComparison(tempRoot) {
  const semanticOutDir = path.join(tempRoot, 'semantic-dist');
  const nativeOutDir = path.join(tempRoot, 'native-dist');

  await runViteBuild('semantic', semanticOutDir);
  await runViteBuild('native', nativeOutDir);

  const [semanticPort, nativePort] = await allocatePorts(2);
  const semantic = await startPreviewServer('semantic', semanticPort, semanticOutDir);
  const native = await startPreviewServer('native', nativePort, nativeOutDir);

  try {
    await compareServerPair('build-preview', urlFor(semanticPort), urlFor(nativePort));
  } finally {
    await Promise.all([stopProcess(semantic), stopProcess(native)]);
  }
}

/** 启动指定模式的 Vite dev server。 */
async function startDevServer(mode, port) {
  const processRef = startViteProcess(`${mode}-dev`, ['--host', serverHost, '--port', String(port), '--strictPort'], {
    GSS_ACCEPTANCE_CSS_MODE: mode
  });
  await waitForHttp(urlFor(port), processRef);
  return processRef;
}

/** 启动指定模式和产物目录的 Vite preview server。 */
async function startPreviewServer(mode, port, outDir) {
  const processRef = startViteProcess(
    `${mode}-preview`,
    ['preview', '--host', serverHost, '--port', String(port), '--strictPort', '--outDir', outDir],
    {
      GSS_ACCEPTANCE_CSS_MODE: mode
    }
  );
  await waitForHttp(urlFor(port), processRef);
  return processRef;
}

/** 构建指定模式的临时产物，避免覆盖 fixture 默认 dist。 */
async function runViteBuild(mode, outDir) {
  await runCommand(
    `${mode}-build`,
    ['pnpm', '--filter', fixturePackage, 'exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir'],
    {
      GSS_ACCEPTANCE_CSS_MODE: mode
    }
  );
}

/** 启动 Vite 子进程并捕获日志，失败时用于诊断。 */
function startViteProcess(label, viteArgs, extraEnv) {
  return startProcess(label, ['pnpm', '--filter', fixturePackage, 'exec', 'vite', ...viteArgs], extraEnv);
}

/** 启动 corepack 子进程并维护输出缓冲。 */
function startProcess(label, args, extraEnv) {
  const child = spawn('corepack', args, {
    cwd: root,
    env: createProcessEnv(extraEnv),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const output = [];

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => output.push(chunk));
  child.stderr.on('data', (chunk) => output.push(chunk));

  return { label, child, output };
}

/** 运行一次性命令，主要用于 build 阶段。 */
async function runCommand(label, args, extraEnv) {
  const processRef = startProcess(label, args, extraEnv);
  const [code, signal] = await once(processRef.child, 'exit');

  if (code !== 0) {
    throw new Error(`${label} 失败，code=${code ?? 'null'} signal=${signal ?? 'null'}\n${formatProcessOutput(processRef)}`);
  }
}

/** 创建传给子进程的环境变量。 */
function createProcessEnv(extraEnv) {
  return {
    ...process.env,
    FORCE_COLOR: '0',
    ...extraEnv
  };
}

/** 等待 HTTP 服务可访问，并在子进程提前退出时抛出日志。 */
async function waitForHttp(url, processRef) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < requestTimeoutMs) {
    if (processRef.child.exitCode !== null) {
      throw new Error(`${processRef.label} 启动前退出\n${formatProcessOutput(processRef)}`);
    }

    try {
      const response = await fetch(url, { cache: 'no-store' });

      if (response.ok) {
        return;
      }
    } catch {
      // Vite server 尚未 ready 时 fetch 会失败，继续轮询。
    }

    await delay(250);
  }

  throw new Error(`${processRef.label} 启动超时: ${url}\n${formatProcessOutput(processRef)}`);
}

/** 停止由本脚本启动的子进程。 */
async function stopProcess(processRef) {
  if (processRef.child.exitCode !== null) {
    return;
  }

  processRef.child.kill('SIGTERM');
  const exited = once(processRef.child, 'exit');
  const timedOut = delay(3_000).then(() => 'timeout');
  const result = await Promise.race([exited, timedOut]);

  if (result === 'timeout' && processRef.child.exitCode === null) {
    processRef.child.kill('SIGKILL');
    await once(processRef.child, 'exit');
  }
}

/** 对比一组 semantic/native 服务在全部视口下的 computed style。 */
async function compareServerPair(label, semanticUrl, nativeUrl) {
  let browser;

  try {
    browser = await chromium.launch(createChromeLaunchOptions());
  } catch (error) {
    throw new Error(
      `无法启动本机 Google Chrome。请确认已安装 Chrome，或通过 GSS_VISUAL_CHROME_EXECUTABLE 指定 Chrome 可执行文件路径。\n${formatError(error)}`
    );
  }

  try {
    for (const viewport of viewports) {
      await compareViewport(label, viewport, semanticUrl, nativeUrl, browser);
    }
  } finally {
    await browser.close();
  }
}

/** 创建本机 Chrome 启动参数，默认使用 Playwright 的 chrome channel。 */
function createChromeLaunchOptions() {
  const baseOptions = { headless: true };

  if (chromeExecutable) {
    return {
      ...baseOptions,
      executablePath: chromeExecutable
    };
  }

  return {
    ...baseOptions,
    channel: 'chrome'
  };
}

/** 在一个视口内打开 semantic/native 页面并执行基础、hover、focus 三类对照。 */
async function compareViewport(label, viewport, semanticUrl, nativeUrl, browser) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const semanticPage = await context.newPage();
  const nativePage = await context.newPage();
  const browserErrors = [];

  attachBrowserErrorCapture(semanticPage, 'semantic', browserErrors);
  attachBrowserErrorCapture(nativePage, 'native', browserErrors);

  try {
    await Promise.all([gotoAcceptancePage(semanticPage, semanticUrl), gotoAcceptancePage(nativePage, nativeUrl)]);
    await assertSemanticClassExpansion(label, viewport.name, semanticPage, nativePage);
    await compareSnapshotSet(label, viewport.name, 'base', viewport, semanticPage, nativePage, [
      ...baseCases,
      ...pseudoCases
    ]);

    await hoverCase(semanticPage, 'hover-button');
    await hoverCase(nativePage, 'hover-button');
    await compareSnapshotSet(label, viewport.name, 'hover', viewport, semanticPage, nativePage, hoverCases);

    await keyboardFocusCase(semanticPage, 'focus-button');
    await keyboardFocusCase(nativePage, 'focus-button');
    await compareSnapshotSet(label, viewport.name, 'focus', viewport, semanticPage, nativePage, focusCases);
    assertNoBrowserErrors(label, viewport.name, browserErrors);
  } catch (error) {
    await saveFailureArtifacts(label, viewport.name, semanticPage, nativePage, error);
    throw error;
  } finally {
    await context.close();
  }
}

/** 打开验收页并等待根节点出现。 */
async function gotoAcceptancePage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-gss-root]', { timeout: requestTimeoutMs });
  await page.waitForTimeout(100);
}

/** 断言 semantic token 比 native token 包含更多 class，证明 adapter 生效。 */
async function assertSemanticClassExpansion(label, viewportName, semanticPage, nativePage) {
  const selector = '[data-gss-case="cascade-active"]';
  const [semanticClassName, nativeClassName] = await Promise.all([
    semanticPage.locator(selector).evaluate((element) => element.className),
    nativePage.locator(selector).evaluate((element) => element.className)
  ]);
  const semanticCount = splitClassName(semanticClassName).length;
  const nativeCount = splitClassName(nativeClassName).length;

  if (semanticCount <= nativeCount) {
    throw new Error(
      `${label}/${viewportName}: semantic class token 未体现 atomic 扩展\nsemantic=${semanticClassName}\nnative=${nativeClassName}`
    );
  }
}

/** 对一组 case 采样并比较 semantic/native 快照。 */
async function compareSnapshotSet(label, viewportName, stateName, viewport, semanticPage, nativePage, cases) {
  const [semanticSnapshot, nativeSnapshot] = await Promise.all([
    collectSnapshot(semanticPage, cases),
    collectSnapshot(nativePage, cases)
  ]);

  assertExpectedSnapshot(label, viewportName, stateName, viewport, semanticSnapshot, cases);
  assertExpectedSnapshot(label, viewportName, stateName, viewport, nativeSnapshot, cases);
  compareSnapshots(label, viewportName, stateName, semanticSnapshot, nativeSnapshot);
}

/** 从页面收集指定 case 的 computed style 和可选布局尺寸。 */
async function collectSnapshot(page, cases) {
  return page.evaluate((caseSpecs) => {
    const snapshot = {};

    for (const spec of caseSpecs) {
      const element = document.querySelector(`[data-gss-case="${spec.id}"]`);

      if (!element) {
        throw new Error(`缺少验收元素: ${spec.id}`);
      }

      const style = window.getComputedStyle(element, spec.pseudo ?? null);
      const key = spec.pseudo ? `${spec.id}${spec.pseudo}` : spec.id;
      const styles = {};

      for (const property of spec.properties) {
        styles[property] = style[property];
      }

      const rect = spec.rect ? element.getBoundingClientRect() : undefined;
      snapshot[key] = {
        styles,
        rect: rect
          ? {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            }
          : undefined
      };
    }

    return snapshot;
  }, cases);
}

/** 校验每个 case 的关键期望值，避免 semantic/native 同时错误却仍然相等。 */
function assertExpectedSnapshot(label, viewportName, stateName, viewport, snapshot, cases) {
  for (const spec of cases) {
    const key = createSnapshotKey(spec);
    const actual = snapshot[key];
    const expected = {
      ...(spec.expected ?? {}),
      ...(spec.expectedByViewport?.[viewport.name] ?? {})
    };

    for (const [property, expectedValue] of Object.entries(expected)) {
      const actualValue = actual.styles[property];

      if (actualValue !== expectedValue) {
        throw new Error(
          `${label}/${viewportName}/${stateName}/${key}: ${property} 期望 ${expectedValue}，实际 ${actualValue}`
        );
      }
    }
  }
}

/** 比较 semantic/native 快照，只允许 class token 等非视觉信息不同。 */
function compareSnapshots(label, viewportName, stateName, semanticSnapshot, nativeSnapshot) {
  for (const [key, semanticValue] of Object.entries(semanticSnapshot)) {
    const nativeValue = nativeSnapshot[key];

    if (!nativeValue) {
      throw new Error(`${label}/${viewportName}/${stateName}: native 缺少快照 ${key}`);
    }

    for (const [property, semanticStyle] of Object.entries(semanticValue.styles)) {
      const nativeStyle = nativeValue.styles[property];

      if (semanticStyle !== nativeStyle) {
        throw new Error(
          `${label}/${viewportName}/${stateName}/${key}: ${property} 不一致，semantic=${semanticStyle} native=${nativeStyle}`
        );
      }
    }

    if (semanticValue.rect && nativeValue.rect) {
      compareRect(label, viewportName, stateName, key, semanticValue.rect, nativeValue.rect);
    }
  }
}

/** 使用少量容忍比较布局尺寸，避免浏览器浮点取整导致误报。 */
function compareRect(label, viewportName, stateName, key, semanticRect, nativeRect) {
  for (const property of ['x', 'y', 'width', 'height']) {
    const diff = Math.abs(semanticRect[property] - nativeRect[property]);

    if (diff > rectTolerance) {
      throw new Error(
        `${label}/${viewportName}/${stateName}/${key}: rect.${property} 不一致，semantic=${semanticRect[property]} native=${nativeRect[property]}`
      );
    }
  }
}

/** 对指定元素触发 hover 状态。 */
async function hoverCase(page, caseId) {
  await page.locator(`[data-gss-case="${caseId}"]`).hover();
}

/** 通过键盘 Tab 触发 focus-visible 状态，避免 programmatic focus 无法命中伪类。 */
async function keyboardFocusCase(page, caseId) {
  await page.bringToFront();
  await page.keyboard.press('Home');

  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press('Tab');
    const activeCase = await page.evaluate(() => document.activeElement?.getAttribute('data-gss-case'));

    if (activeCase === caseId) {
      return;
    }
  }

  throw new Error(`无法通过键盘聚焦验收元素: ${caseId}`);
}

/** 捕获浏览器 console error 和 pageerror。 */
function attachBrowserErrorCapture(page, name, errors) {
  page.on('console', (message) => {
    if (message.type() === 'error' && !isIgnoredConsoleError(message.text())) {
      errors.push(`[${name}] console.error: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    errors.push(`[${name}] pageerror: ${formatError(error)}`);
  });
  page.on('response', (response) => {
    const status = response.status();

    if (status >= 400 && !isIgnoredResourceUrl(response.url())) {
      errors.push(`[${name}] response ${status}: ${response.url()}`);
    }
  });
}

/** 忽略浏览器对 favicon 缺失产生的通用 console error。 */
function isIgnoredConsoleError(text) {
  return text.includes('Failed to load resource') && text.includes('404');
}

/** 忽略不影响验收语义的浏览器默认资源请求。 */
function isIgnoredResourceUrl(url) {
  try {
    return new URL(url).pathname === '/favicon.ico';
  } catch {
    return false;
  }
}

/** 断言浏览器运行时没有错误。 */
function assertNoBrowserErrors(label, viewportName, errors) {
  if (errors.length > 0) {
    throw new Error(`${label}/${viewportName}: 浏览器运行时出现错误\n${errors.join('\n')}`);
  }
}

/** 保存失败截图和错误文本，便于人工排查视觉差异。 */
async function saveFailureArtifacts(label, viewportName, semanticPage, nativePage, error) {
  await mkdir(artifactDir, { recursive: true });
  const baseName = `${sanitizeFilePart(label)}-${sanitizeFilePart(viewportName)}`;

  await Promise.all([
    semanticPage.screenshot({ path: path.join(artifactDir, `${baseName}-semantic.png`), fullPage: true }),
    nativePage.screenshot({ path: path.join(artifactDir, `${baseName}-native.png`), fullPage: true }),
    writeFile(path.join(artifactDir, `${baseName}-error.txt`), formatError(error), 'utf8')
  ]);
}

/** 一次申请多个空闲端口，减少调用方样板代码。 */
async function allocatePorts(count) {
  const ports = [];

  for (let index = 0; index < count; index += 1) {
    ports.push(await allocatePort());
  }

  return ports;
}

/** 通过系统分配一个当前空闲端口。 */
async function allocatePort() {
  const server = net.createServer();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, serverHost, resolve);
  });

  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));

  if (!address || typeof address === 'string') {
    throw new Error('无法分配本地端口');
  }

  return address.port;
}

/** 创建本地服务 URL。 */
function urlFor(port) {
  return `http://${serverHost}:${port}/`;
}

/** 生成 computed style 快照中的稳定 key。 */
function createSnapshotKey(spec) {
  return spec.pseudo ? `${spec.id}${spec.pseudo}` : spec.id;
}

/** 拆分 DOM className 字符串。 */
function splitClassName(value) {
  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** 延迟一段时间。 */
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** 格式化子进程输出。 */
function formatProcessOutput(processRef) {
  return processRef.output.join('').trim();
}

/** 格式化错误对象。 */
function formatError(error) {
  if (error instanceof Error) {
    return `${error.stack ?? error.message}`;
  }

  return String(error);
}

/** 清理文件名中的特殊字符。 */
function sanitizeFilePart(value) {
  return value.replace(/[^a-z0-9_-]/gi, '-');
}

await main();
