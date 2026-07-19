import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  captureComputedStyles,
  createStyleDiffReport,
  mergeStyleDiffReports,
  writeAndAssertStyleDiffReport
} from '@semantic-atomic-css/devtools';

const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rsbuildBin = path.join(fixtureRoot, 'node_modules/.bin/rsbuild');
const host = '127.0.0.1';
const timeoutMs = 30_000;
const chromeExecutable = process.env.GSS_VISUAL_CHROME_EXECUTABLE;
const styleDiffReports = [];

/** 运行 semantic/native dev、preview 与 Sass partial/full reload 浏览器验收。 */
async function main() {
  const args = process.argv.slice(2);
  const suites = resolveSuites(args);
  const reportFile = resolveReportFile(args);
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'gss-rsbuild-visual-'));

  try {
    for (const suite of suites) {
      await compareDev(suite);
      await comparePreview(suite, tempRoot);
    }
    if (suites.includes('preprocessor')) await verifyPartialReload(tempRoot);
    const report = mergeStyleDiffReports(styleDiffReports);
    await writeAndAssertStyleDiffReport(report, reportFile ? path.resolve(reportFile) : undefined);
    console.log(`Rsbuild CSS Modules visual 验收通过: ${suites.join(', ')}`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

/** 解析可选的 style diff report 输出路径。 */
function resolveReportFile(args) {
  const index = args.indexOf('--report');
  if (index === -1) return undefined;
  const filename = args[index + 1];
  if (!filename || filename.startsWith('--')) throw new Error('--report 需要文件路径。');
  return filename;
}

/** 解析可选的单 suite 参数。 */
function resolveSuites(args) {
  const index = args.indexOf('--suite');
  const suite = index === -1 ? 'all' : args[index + 1];
  if (suite === 'all') return ['base', 'preprocessor'];
  if (suite === 'base' || suite === 'preprocessor') return [suite];
  throw new Error(`不支持的 visual suite: ${suite}`);
}

/** 启动 semantic/native dev 并比较 computed style 与 tokens。 */
async function compareDev(suite) {
  const [semanticPort, nativePort] = await allocatePorts(2);
  const semantic = await startServer('dev', fixtureRoot, suite, 'semantic', semanticPort);
  const native = await startServer('dev', fixtureRoot, suite, 'native', nativePort);
  try {
    await compareServers(`${suite}/dev`, suite, urlFor(semanticPort), urlFor(nativePort));
  } finally {
    await Promise.all([stopProcess(semantic), stopProcess(native)]);
  }
}

/** 构建隔离产物并比较 semantic/native preview。 */
async function comparePreview(suite, tempRoot) {
  const semanticOut = path.join(tempRoot, `${suite}-semantic`);
  const nativeOut = path.join(tempRoot, `${suite}-native`);
  await runBuild(fixtureRoot, suite, 'semantic', semanticOut);
  await runBuild(fixtureRoot, suite, 'native', nativeOut);
  const [semanticPort, nativePort] = await allocatePorts(2);
  const semantic = await startServer('preview', fixtureRoot, suite, 'semantic', semanticPort, semanticOut);
  const native = await startServer('preview', fixtureRoot, suite, 'native', nativePort, nativeOut);
  try {
    await compareServers(`${suite}/preview`, suite, urlFor(semanticPort), urlFor(nativePort));
  } finally {
    await Promise.all([stopProcess(semantic), stopProcess(native)]);
  }
}

/** 在两个 URL 上收集相同交互快照并做严格对照。 */
async function compareServers(label, suite, semanticUrl, nativeUrl) {
  const browser = await chromium.launch(chromeExecutable ? { executablePath: chromeExecutable } : {});
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 520, height: 900 }]) {
      const semantic = await capturePage(browser, semanticUrl, suite, viewport);
      const native = await capturePage(browser, nativeUrl, suite, viewport);
      const report = createStyleDiffReport({
        baselineLabel: 'native',
        candidateLabel: 'semantic',
        runs: [{
          id: `${label}@${viewport.width}x${viewport.height}`,
          viewport,
          baseline: native.styles,
          candidate: semantic.styles
        }]
      });
      styleDiffReports.push(report);
      assertTokenCompatibility(semantic.tokens, native.tokens, `${label} tokens`);
      assert(semantic.assetStatus === 200 && native.assetStatus === 200, `${label} 资源请求应成功`);
      if (label.endsWith('/dev')) {
        assert(semantic.devtools?.schemaVersion === 1 && semantic.devtools.adapter === 'rsbuild', `${label} dev report API 契约不成立`);
        assert(semantic.devtools.environments[0]?.report?.analysis, `${label} dev report 缺少 analyzer analysis`);
        assert(semantic.hasOverlay, `${label} semantic 页面缺少 Shadow DOM overlay`);
        assert(['ready', 'risky', 'blocked'].includes(semantic.overlayState?.health), `${label} overlay 未展示 report health`);
        assert(semantic.overlayState.expanded === 'true' && semantic.overlayState.panelHidden === false, `${label} overlay 展开交互失败`);
        assert(!native.hasOverlay, `${label} native 页面不应注入 GSS overlay`);
      } else {
        assert(!semantic.hasOverlay && !native.hasOverlay, `${label} preview 不应注入 GSS overlay`);
      }
    }
  } finally {
    await browser.close();
  }
}

/** 收集静态、hover/focus、lazy 和资源请求状态。 */
async function capturePage(browser, url, suite, viewport) {
  const page = await browser.newPage({ viewport });
  try {
    await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
    await page.waitForSelector('#tokens');
    const styles = await captureCases(page, suite);
    if (suite === 'base') {
      await page.hover('#hover-button');
      styles.hover = await readStyle(page, '#hover-button', ['color', 'backgroundColor']);
      await page.focus('#hover-button');
      styles.focus = await readStyle(page, '#hover-button', ['outlineColor', 'outlineStyle', 'outlineWidth']);
      await page.click('#load-lazy');
      await page.waitForSelector('#lazy');
      styles.lazy = await readStyle(page, '#lazy', ['color', 'marginTop']);
    }

    const tokens = await page.evaluate(() => ({
      eager: globalThis.__GSS_FIXTURE_TOKENS__,
      lazy: globalThis.__GSS_FIXTURE_LAZY_TOKEN__
    }));
    const assetStatus = await page.evaluate(async () => {
      const selector = document.querySelector('#asset-button, #scss-asset');
      const background = getComputedStyle(selector).backgroundImage;
      const match = background.match(/^url\(["']?(.*?)["']?\)$/);
      return match ? (await fetch(match[1])).status : 200;
    });
    const hasOverlay = await page.locator('[data-semantic-atomic-css-overlay]').evaluateAll(
      (elements) => elements.some((element) => Boolean(element.shadowRoot))
    );
    if (hasOverlay) {
      await page.waitForFunction(() => {
        const host = document.querySelector('[data-semantic-atomic-css-overlay]');
        const health = host?.shadowRoot?.querySelector('button')?.getAttribute('data-health');
        return health === 'ready' || health === 'risky' || health === 'blocked';
      });
    }
    const overlayState = hasOverlay
      ? await page.locator('[data-semantic-atomic-css-overlay]').evaluate((element) => {
          const button = element.shadowRoot?.querySelector('button');
          const panel = element.shadowRoot?.querySelector('section');
          button?.click();
          return {
            health: button?.getAttribute('data-health'),
            expanded: button?.getAttribute('aria-expanded'),
            panelHidden: panel?.hasAttribute('hidden')
          };
        })
      : undefined;
    const devtools = hasOverlay
      ? await page.evaluate(async () => (await fetch('/__semantic-atomic-css/report')).json())
      : undefined;
    return { styles, tokens, assetStatus, hasOverlay, overlayState, devtools };
  } finally {
    await page.close();
  }
}

/** 按 suite 读取稳定验收锚点。 */
async function captureCases(page, suite) {
  const definitions = suite === 'base'
    ? [
        ['shell', '#shell', ['display', 'gap', 'padding', 'gridTemplateColumns']],
        ['asset', '#asset-button', ['color', 'backgroundColor', 'backgroundImage', 'borderRadius']],
        ['publicAsset', '#public-asset', ['backgroundImage', 'minHeight']],
        ['disabled', '#disabled-button', ['color', 'cursor']],
        ['cascade', '#cascade-box', ['color', 'borderTopColor', 'borderLeftColor', 'borderTopWidth']],
        ['devCascade', '#dev-cascade', ['color']],
        ['important', '#important-box', ['color']],
        ['dashed', '#dashed-token', ['color', 'backgroundColor']],
        ['icssCollision', '#icss-collision', ['color', 'padding']],
        ['fallback', '#unsafe-child', ['boxShadow']]
      ]
    : [
        ['shell', '#preprocessor-shell', ['display', 'gap', 'padding']],
        ['scssAsset', '#scss-asset', ['color', 'backgroundColor', 'backgroundImage']],
        ['scssSafe', '#scss-safe', ['color', 'padding']],
        ['lessSafe', '#less-safe', ['color', 'backgroundColor', 'borderRadius']],
        ['lessChild', '#less-child', ['fontWeight']]
      ];
  return captureComputedStyles(
    page,
    definitions.map(([name, selector, properties]) => ({ id: name, selector, properties }))
  );
}

/** 读取指定 computed style 属性。 */
async function readStyle(page, selector, properties) {
  return await page.$eval(selector, (element, names) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(names.map((name) => [name, String(style[name]).replace(location.origin, '<origin>')]));
  }, properties);
}

/** 在临时副本中修改 Sass partial，再移除 import，证明没有 stale style。 */
async function verifyPartialReload(tempRoot) {
  const copyRoot = path.join(tempRoot, 'hmr-fixture');
  await cp(fixtureRoot, copyRoot, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}node_modules`) && !source.includes(`${path.sep}dist`)
  });
  await symlink(path.join(fixtureRoot, 'node_modules'), path.join(copyRoot, 'node_modules'), 'dir');
  const port = (await allocatePorts(1))[0];
  const server = await startServer('dev', copyRoot, 'preprocessor', 'semantic', port);
  const browser = await chromium.launch(chromeExecutable ? { executablePath: chromeExecutable } : {});
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });

  try {
    await page.goto(urlFor(port), { waitUntil: 'load', timeout: timeoutMs });
    const partial = path.join(copyRoot, 'suites/preprocessor/src/_tokens.scss');
    const before = await readFile(partial, 'utf8');
    await writeFile(partial, before.replace('#0f766e', '#be123c'));
    try {
      await page.waitForFunction(
        () => getComputedStyle(document.querySelector('#scss-safe')).color === 'rgb(190, 18, 60)',
        undefined,
        { timeout: timeoutMs }
      );
    } catch (error) {
      const state = await page.evaluate(() => ({
        color: getComputedStyle(document.querySelector('#scss-safe')).color,
        token: globalThis.__GSS_FIXTURE_TOKENS__?.sassStyles?.safeScss,
        body: document.body.innerHTML
      }));
      throw new Error(`Sass partial 更新未生效: ${JSON.stringify(state)}\n${server.output}`, { cause: error });
    }

    const entry = path.join(copyRoot, 'suites/preprocessor/src/main.js');
    await writeFile(entry, [
      "import './styles.css';",
      "import baseStyles from './Base.module.css';",
      "globalThis.__GSS_FIXTURE_TOKENS__ = { baseStyles };",
      "document.querySelector('#root').innerHTML = `<main id=\"preprocessor-shell\" class=\"${baseStyles.shell}\"><pre id=\"tokens\">base only</pre></main>`;",
      ''
    ].join('\n'));
    await page.waitForFunction(() => !document.querySelector('#scss-safe'), undefined, { timeout: timeoutMs });
    const cssText = await page.evaluate(() => [...document.styleSheets].map((sheet) => {
      try { return [...sheet.cssRules].map((rule) => rule.cssText).join('\n'); }
      catch { return ''; }
    }).join('\n'));
    assert(!cssText.includes('fixture_Theme-module__'), '移除 import 后不应保留旧 SCSS fallback');
    assert(!cssText.includes('_color_be123c'), '移除 import 后不应保留旧 SCSS atomic class');
  } finally {
    await page.close();
    await browser.close();
    await stopProcess(server);
  }
}

/** semantic token 必须以前缀方式继承 native token，且至少一个 class 获得增强。 */
function assertTokenCompatibility(semantic, native, label) {
  let augmented = 0;
  const walk = (semanticValue, nativeValue, key) => {
    if (nativeValue && typeof nativeValue === 'object') {
      assertDeepEqual(Object.keys(semanticValue).sort(), Object.keys(nativeValue).sort(), `${label}.${key} keys`);
      for (const child of Object.keys(nativeValue)) walk(semanticValue[child], nativeValue[child], `${key}.${child}`);
      return;
    }
    assert(typeof semanticValue === 'string' && typeof nativeValue === 'string', `${label}.${key} 应为字符串`);
    if (nativeValue.includes('fixture_')) {
      assert(semanticValue.startsWith(nativeValue), `${label}.${key} 应保留 native token 前缀`);
      if (semanticValue.length > nativeValue.length) augmented += 1;
    } else {
      assert(semanticValue === nativeValue, `${label}.${key} 非 class export 应保持一致`);
    }
  };
  walk(semantic.eager, native.eager, 'eager');
  if (native.lazy) walk(semantic.lazy, native.lazy, 'lazy');
  if (native.eager?.collisionLabel) {
    assert(semantic.eager.collision === native.eager.collision, `${label}.eager.collision 同值歧义应保持 native class token`);
    assert(semantic.eager.collisionLabel === native.eager.collisionLabel, `${label}.eager.collisionLabel 非 class export 应保持原值`);
  }
  assert(augmented > 0, `${label} 至少一个 token 应追加 atomic class`);
}

/** 启动 dev/preview 并等待 HTTP 可用。 */
async function startServer(action, cwd, suite, mode, port, outDir) {
  const child = spawn(rsbuildBin, [action, '--host', host, '--port', String(port)], {
    cwd,
    env: {
      ...process.env,
      GSS_FIXTURE_SUITE: suite,
      GSS_FIXTURE_CSS_MODE: mode,
      ...(outDir ? { GSS_FIXTURE_OUT_DIR: outDir } : {})
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.output = '';
  child.stdout.on('data', (chunk) => { child.output = `${child.output}${chunk}`.slice(-12_000); });
  child.stderr.on('data', (chunk) => { child.output = `${child.output}${chunk}`.slice(-12_000); });
  await waitForServer(child, urlFor(port));
  return child;
}

/** 执行隔离 build。 */
async function runBuild(cwd, suite, mode, outDir) {
  const child = spawn(rsbuildBin, ['build'], {
    cwd,
    env: {
      ...process.env,
      GSS_FIXTURE_SUITE: suite,
      GSS_FIXTURE_CSS_MODE: mode,
      GSS_FIXTURE_OUT_DIR: outDir
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const [code, signal] = await once(child, 'exit');
  if (signal || code !== 0) throw new Error(`Rsbuild build 失败: ${suite}/${mode}\n${output}`);
}

/** 轮询服务，同时观察子进程提前退出。 */
async function waitForServer(child, url) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Rsbuild server 提前退出 (${child.exitCode})\n${child.output}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`等待 Rsbuild server 超时: ${url}\n${child.output}`);
}

/** 只终止本脚本创建的子进程。 */
async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

/** 获取当前可绑定的临时端口。 */
async function allocatePorts(count) {
  const ports = [];
  for (let index = 0; index < count; index += 1) {
    const server = net.createServer();
    server.listen(0, host);
    await once(server, 'listening');
    ports.push(server.address().port);
    server.close();
    await once(server, 'close');
  }
  return ports;
}

function urlFor(port) {
  return `http://${host}:${port}/`;
}

function assertDeepEqual(left, right, message) {
  assert(JSON.stringify(left) === JSON.stringify(right), `${message}\nsemantic=${JSON.stringify(left)}\nnative=${JSON.stringify(right)}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await main();
