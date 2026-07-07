import { promises as fs } from 'node:fs';
import path from 'node:path';
import { preprocessCSS, type Plugin, type ResolvedConfig } from 'vite';
import {
  createTransformer,
  transformCss,
  type AtomicDeclaration,
  type Diagnostic,
  type TransformCssOptions,
  type TransformCssResult,
  type TransformReport,
  type Transformer
} from '@semantic-atomic-css/core';
import { analyzeBuild } from '@semantic-atomic-css/analyzer';
import type { BuildAnalysis } from '@semantic-atomic-css/analyzer';
import {
  augmentCssModuleTokens,
  cleanRequestId,
  collectExportedClassNames,
  createCssModulesScopeStrategy,
  createPreprocessCssModulesOptions,
  isCssModuleFile,
  type CssModuleTokens
} from './cssModules.js';
import { resolveOptions } from './options.js';
import type { ResolvedSemanticAtomicCssOptions, SemanticAtomicCssOptions } from './types.js';

const virtualCssPrefix = 'virtual:semantic-atomic-css/css.css?source=';
const resolvedVirtualCssPrefix = '\0semantic-atomic-css/css.css?source=';
const resolvedModulePrefix = '\0semantic-atomic-css/module?source=';
const buildCssFileName = 'assets/semantic-atomic.css';

/** 单个 CSS Module 在 Route A 下的完整转换结果。 */
type CssModuleTransformResult = {
  id: string;
  sourceCss: string;
  scopedCss: string;
  tokens: CssModuleTokens;
  transform: TransformCssResult;
};

/** 创建 Vite adapter 插件。 */
export function semanticAtomicCss(options: SemanticAtomicCssOptions = {}): Plugin {
  const resolvedOptions = resolveOptions(options);
  const buildResults = new Map<string, CssModuleTransformResult>();
  const devResults = new Map<string, CssModuleTransformResult>();
  const devAtomicOrder = new Map<string, number>();
  const pendingDevTransforms = new Set<Promise<void>>();
  const buildOrder: string[] = [];
  const warnedDiagnostics = new Set<string>();
  let config: ResolvedConfig | undefined;
  let buildTransformer: Transformer | undefined;

  return {
    name: 'semantic-atomic-css:vite',
    enforce: 'pre',

    configResolved(resolvedConfig): void {
      validatePhase4Options(resolvedConfig, resolvedOptions);
      config = resolvedConfig;
    },

    buildStart(): void {
      buildResults.clear();
      devAtomicOrder.clear();
      pendingDevTransforms.clear();
      buildOrder.length = 0;
      warnedDiagnostics.clear();
      buildTransformer = createTransformer(resolveCoreOptions(resolvedOptions, 'build'));
    },

    async resolveId(id, importer): Promise<string | null> {
      if (id.startsWith(virtualCssPrefix)) {
        return id.replace(virtualCssPrefix, resolvedVirtualCssPrefix);
      }

      if (id.startsWith(resolvedModulePrefix)) {
        return id;
      }

      if (!config || !cleanRequestId(id).endsWith('.module.css')) {
        return null;
      }

      const resolved = await this.resolve(id, importer, { skipSelf: true });
      const file = cleanRequestId(resolved?.id ?? id);

      if (isCssModuleFile(file, config.root, resolvedOptions)) {
        return createResolvedModuleId(file);
      }

      return null;
    },

    async load(id): Promise<{ code: string; map: null } | string | null> {
      if (id.startsWith(resolvedVirtualCssPrefix)) {
        return loadDevVirtualCss(id, devResults, devAtomicOrder, pendingDevTransforms);
      }

      if (!id.startsWith(resolvedModulePrefix)) {
        return null;
      }

      const file = decodeResolvedModuleSource(id);

      if (!config) {
        return null;
      }

      const css = await fs.readFile(file, 'utf8');
      const result = await trackDevTransform(
        config,
        pendingDevTransforms,
        transformCssModule({
          id: file,
          css,
          config,
          options: resolvedOptions,
          buildTransformer,
          buildResults,
          devResults,
          devAtomicOrder,
          buildOrder
        })
      );
      emitDiagnostics(this, result.transform.diagnostics, resolvedOptions, warnedDiagnostics);

      return {
        code: renderCssModuleJs(file, result, config.command),
        map: null
      };
    },

    handleHotUpdate(context): [] | void {
      const file = cleanRequestId(context.file);

      if (!config || !isCssModuleFile(file, config.root, resolvedOptions)) {
        return;
      }

      deleteTransformResult(devResults, file);
      rebuildDevAtomicOrder(devAtomicOrder, devResults);
      pendingDevTransforms.clear();
      context.server.ws.send({ type: 'full-reload' });
      return [];
    },

    transformIndexHtml(html): string {
      if (!config || config.command !== 'build' || buildResults.size === 0) {
        return html;
      }

      return injectCssLinkIntoHtmlSource(html, buildCssFileName);
    },

    generateBundle(_outputOptions, bundle): void {
      if (!buildTransformer || buildResults.size === 0) {
        return;
      }

      const css = createBuildCss(buildTransformer, buildOrder, buildResults);

      if (css.trim().length > 0) {
        this.emitFile({
          type: 'asset',
          fileName: buildCssFileName,
          source: css
        });
        injectCssIntoHtml(bundle, buildCssFileName);
      }

      if (resolvedOptions.manifest.enabled) {
        this.emitFile({
          type: 'asset',
          fileName: resolvedOptions.manifest.filename,
          source: JSON.stringify(buildTransformer.getManifest(), null, 2)
        });
      }

      if (resolvedOptions.report.enabled) {
        this.emitFile({
          type: 'asset',
          fileName: resolvedOptions.report.filename,
          source: JSON.stringify(createBuildReport(buildTransformer, buildOrder, buildResults, css), null, 2)
        });
      }
    },

    async writeBundle(outputOptions): Promise<void> {
      if (!config || !buildTransformer || buildResults.size === 0) {
        return;
      }

      const outDir = outputOptions.dir ?? path.resolve(config.root, config.build.outDir);
      await injectCssIntoWrittenHtml(outDir, buildCssFileName);
    }
  };
}

/** 在 dev 阶段登记正在执行的 CSS Module transform，供 virtual CSS 等待快照稳定。 */
async function trackDevTransform(
  config: ResolvedConfig,
  pendingDevTransforms: Set<Promise<void>>,
  transform: Promise<CssModuleTransformResult>
): Promise<CssModuleTransformResult> {
  if (config.command !== 'serve') {
    return transform;
  }

  const pending = transform.then(
    () => undefined,
    () => undefined
  );
  pendingDevTransforms.add(pending);

  try {
    return await transform;
  } finally {
    pendingDevTransforms.delete(pending);
  }
}

/** 兼容早期命名的插件工厂别名。 */
export const semanticAtomicCssPlugin = semanticAtomicCss;

/** 校验 Phase 4 尚未实现或无法安全继承的配置。 */
function validatePhase4Options(config: ResolvedConfig, options: ResolvedSemanticAtomicCssOptions): void {
  if (options.diagnostics.strict) {
    throw createUnsupportedFeatureError({
      feature: 'diagnostics.strict',
      id: 'semanticAtomicCss.diagnostics.strict',
      reason: 'diagnostics.strict: true 尚未在 Phase 4 实现，请关闭该配置。'
    });
  }

  if (options.modules.namedExports || inheritsViteNamedExports(config, options)) {
    throw createUnsupportedFeatureError({
      feature: 'modules.namedExports',
      id: options.modules.namedExports ? 'semanticAtomicCss.modules.namedExports' : 'vite.css.modules.namedExports',
      reason:
        'modules.namedExports: true 尚未在 Phase 4 实现，请关闭 semanticAtomicCss({ modules.namedExports }) 或 Vite css.modules.namedExports。'
    });
  }

  if (config.css.modules === false && !options.modules.configured) {
    throw createUnsupportedFeatureError({
      feature: 'vite.css.modules.false',
      id: 'vite.css.modules',
      reason:
        'Vite css.modules: false 会阻止 Route A 获取 CSS Modules tokens，请启用 css.modules 或显式配置 semanticAtomicCss({ modules: {} })。'
    });
  }
}

/** 创建配置保护使用的结构化错误消息，便于 CI 日志解析。 */
function createUnsupportedFeatureError(input: { feature: string; id: string; reason: string }): Error {
  return new Error(
    `[semantic-atomic-css] unsupported-feature feature=${input.feature} id=${input.id} reason=${input.reason}`
  );
}

/** 判断当前 Route A 是否会从 Vite 原生 css.modules 继承 namedExports。 */
function inheritsViteNamedExports(config: ResolvedConfig, options: ResolvedSemanticAtomicCssOptions): boolean {
  const modules = config.css.modules as ({ namedExports?: boolean } & Record<string, unknown>) | false | undefined;

  return (
    !options.modules.configured &&
    typeof modules === 'object' &&
    modules !== null &&
    modules.namedExports === true
  );
}

/** 删除指定文件的 transform 结果，并兼容 macOS /var 与 /private/var 路径别名。 */
function deleteTransformResult(results: Map<string, CssModuleTransformResult>, file: string): void {
  if (results.delete(file)) {
    return;
  }

  const target = normalizeFileIdentity(file);

  for (const key of results.keys()) {
    if (normalizeFileIdentity(key) === target) {
      results.delete(key);
      return;
    }
  }
}

/** 归一化文件身份，避免同一文件因系统路径别名无法命中缓存。 */
function normalizeFileIdentity(file: string): string {
  const resolved = normalizeToPosix(path.resolve(file));
  return process.platform === 'darwin' && resolved.startsWith('/private/') ? resolved.slice('/private'.length) : resolved;
}

/** 创建内部 CSS Modules JS virtual module id。 */
function createResolvedModuleId(id: string): string {
  return `${resolvedModulePrefix}${encodeId(id)}`;
}

/** 从内部 CSS Modules JS virtual module id 中还原源文件路径。 */
function decodeResolvedModuleSource(id: string): string {
  return decodeId(id.slice(resolvedModulePrefix.length));
}

/** 转换单个 CSS Modules 文件，并维护 dev/build 状态。 */
async function transformCssModule(input: {
  id: string;
  css: string;
  config: ResolvedConfig;
  options: ResolvedSemanticAtomicCssOptions;
  buildTransformer: Transformer | undefined;
  buildResults: Map<string, CssModuleTransformResult>;
  devResults: Map<string, CssModuleTransformResult>;
  devAtomicOrder: Map<string, number>;
  buildOrder: string[];
}): Promise<CssModuleTransformResult> {
  if (input.config.command === 'build') {
    const cached = input.buildResults.get(input.id);

    if (cached) {
      return cached;
    }
  }

  const preprocessed = await preprocessCssModule(input.id, input.css, input.config, input.options);
  const exportedClassNames = collectExportedClassNames(preprocessed.tokens, preprocessed.css);
  const scope = createCssModulesScopeStrategy(exportedClassNames);
  const coreInput = {
    id: input.id,
    css: preprocessed.css,
    scope
  };
  const transform =
    input.config.command === 'build' && input.buildTransformer
      ? input.buildTransformer.transformCss(coreInput)
      : transformCss(coreInput, resolveCoreOptions(input.options, 'serve'));
  const result: CssModuleTransformResult = {
    id: input.id,
    sourceCss: input.css,
    scopedCss: preprocessed.css,
    tokens: augmentCssModuleTokens(preprocessed.tokens, transform.classes),
    transform
  };

  if (input.config.command === 'build') {
    input.buildResults.set(input.id, result);
    input.buildOrder.push(input.id);
  } else {
    registerDevAtomicOrder(input.devAtomicOrder, transform.atomic);
    input.devResults.set(input.id, result);
  }

  return result;
}

/** 调用 Vite 原生 preprocessCSS，获取 scoped CSS 和 CSS Modules tokens。 */
async function preprocessCssModule(
  id: string,
  css: string,
  config: ResolvedConfig,
  options: ResolvedSemanticAtomicCssOptions
): Promise<{ css: string; tokens: CssModuleTokens }> {
  const modules = createPreprocessCssModulesOptions(config.css.modules, options);

  if (modules === false) {
    throw new Error(`[semantic-atomic-css] ${id} 无法获取 CSS Modules tokens，因为 Vite css.modules 已关闭。`);
  }

  const preprocessConfig: ResolvedConfig = {
    ...config,
    css: {
      ...config.css,
      modules
    }
  };
  const result = await preprocessCSS(css, id, preprocessConfig);

  if (!result.modules) {
    throw new Error(`[semantic-atomic-css] ${id} 的 Vite preprocessCSS 未返回 CSS Modules tokens，已停止构建以避免 silent miscompile。`);
  }

  return {
    css: result.code,
    tokens: result.modules
  };
}

/** 渲染替代 CSS Modules 的 JS module。 */
function renderCssModuleJs(
  id: string,
  result: CssModuleTransformResult,
  command: ResolvedConfig['command']
): string {
  const cssImport = command === 'serve' ? `import ${JSON.stringify(createVirtualCssId(id))};\n` : '';
  return `${cssImport}const tokens = ${JSON.stringify(result.tokens, null, 2)};\nexport default tokens;\n`;
}

/** 读取 dev virtual CSS 内容，并等待当前并发 transform 排空后再创建全局快照。 */
async function loadDevVirtualCss(
  id: string,
  devResults: Map<string, CssModuleTransformResult>,
  devAtomicOrder: Map<string, number>,
  pendingDevTransforms: Set<Promise<void>>
): Promise<string> {
  const source = decodeVirtualCssSource(id);

  await waitForDevTransformIdle(pendingDevTransforms);

  const result = devResults.get(source);

  if (!result) {
    return '';
  }

  return createDevCss(devResults, devAtomicOrder);
}

/** 等待当前 dev CSS Module transform 队列短暂排空，避免 virtual CSS 拿到 partial snapshot。 */
async function waitForDevTransformIdle(pendingDevTransforms: Set<Promise<void>>): Promise<void> {
  const deadline = Date.now() + 1_000;

  do {
    await delay(0);

    if (pendingDevTransforms.size === 0) {
      return;
    }

    await Promise.allSettled([...pendingDevTransforms]);
  } while (pendingDevTransforms.size > 0 && Date.now() < deadline);
}

/** 创建 dev 阶段的全局 CSS 快照，避免不同模块重复 atomic class 后破坏 cascade 顺序。 */
function createDevCss(
  devResults: Map<string, CssModuleTransformResult>,
  devAtomicOrder?: Map<string, number>
): string {
  const atomic = createDevAtomicCss(devResults, devAtomicOrder);
  const preservedCss = [...devResults.values()].map((result) => result.transform.css.preserved);
  return joinCss([atomic, ...preservedCss]);
}

/** 聚合当前 dev 已知模块的 atomic declaration，并按 atomic key 去重。 */
function createDevAtomicCss(
  devResults: Map<string, CssModuleTransformResult>,
  devAtomicOrder?: Map<string, number>
): string {
  const declarations = new Map<string, AtomicDeclaration>();

  for (const result of devResults.values()) {
    for (const declaration of result.transform.atomic) {
      if (!declarations.has(declaration.key)) {
        declarations.set(declaration.key, declaration);
      }
    }
  }

  return renderAtomicDeclarations([...declarations.values()], devAtomicOrder);
}

/** 渲染 adapter 内部聚合出来的 atomic declarations，保持 core 输出格式兼容。 */
function renderAtomicDeclarations(
  declarations: AtomicDeclaration[],
  devAtomicOrder?: Map<string, number>
): string {
  const css = declarations
    .map((declaration) => renderAtomicDeclaration(declaration, devAtomicOrder?.get(declaration.key)))
    .join('\n\n');

  if (!devAtomicOrder || declarations.length === 0) {
    return css;
  }

  return joinCss([renderDevLayerPrelude(devAtomicOrder), css]);
}

/** 渲染单条 atomic declaration，并恢复其 @media/@supports 上下文。 */
function renderAtomicDeclaration(declaration: AtomicDeclaration, devLayerOrder?: number): string {
  const selector = `.${declaration.className}${declaration.context.pseudo ?? ''}`;
  const rule = renderCssRule(selector, declaration.declaration);
  const contextualRule = wrapAtomicAtRules(rule, declaration);
  return devLayerOrder === undefined ? contextualRule : wrapDevLayer(contextualRule, devLayerOrder);
}

/** 渲染单 declaration CSS rule，输出格式与 core renderRule 保持一致。 */
function renderCssRule(
  selector: string,
  declaration: AtomicDeclaration['declaration']
): string {
  return [
    `${selector} {`,
    `  ${declaration.prop}: ${declaration.value}${declaration.important ? ' !important' : ''};`,
    '}'
  ].join('\n');
}

/** 按 core 约定先包 @supports，再包 @media，保证上下文语义稳定。 */
function wrapAtomicAtRules(css: string, declaration: AtomicDeclaration): string {
  let output = css;

  if (declaration.context.supports) {
    output = `@supports ${declaration.context.supports} {\n${indentCssBlock(output)}\n}`;
  }

  if (declaration.context.media) {
    output = `@media ${declaration.context.media} {\n${indentCssBlock(output)}\n}`;
  }

  return output;
}

/** 给 CSS block 增加两空格缩进。 */
function indentCssBlock(css: string): string {
  return css
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

/** 记录 dev 阶段 atomic key 的首次声明顺序，供 cascade layer 固定优先级。 */
function registerDevAtomicOrder(devAtomicOrder: Map<string, number>, declarations: AtomicDeclaration[]): void {
  for (const declaration of declarations) {
    if (!devAtomicOrder.has(declaration.key)) {
      devAtomicOrder.set(declaration.key, devAtomicOrder.size);
    }
  }
}

/** HMR 删除模块后重建 dev atomic 顺序，避免旧 key 长期残留。 */
function rebuildDevAtomicOrder(
  devAtomicOrder: Map<string, number>,
  devResults: Map<string, CssModuleTransformResult>
): void {
  devAtomicOrder.clear();

  for (const result of devResults.values()) {
    registerDevAtomicOrder(devAtomicOrder, result.transform.atomic);
  }
}

/** 输出 dev cascade layer 顺序声明，让后注入的重复 atomic key 不能覆盖更晚语义层。 */
function renderDevLayerPrelude(devAtomicOrder: Map<string, number>): string {
  const layers = [...devAtomicOrder.values()]
    .sort((left, right) => left - right)
    .map((order) => createDevLayerName(order));
  return `@layer ${layers.join(', ')};`;
}

/** 把单条 dev atomic rule 包进稳定层。 */
function wrapDevLayer(css: string, order: number): string {
  return `@layer ${createDevLayerName(order)} {\n${indentCssBlock(css)}\n}`;
}

/** 根据声明顺序生成稳定 dev layer 名称。 */
function createDevLayerName(order: number): string {
  return `gss-${order}`;
}

/** 生成 dev virtual CSS 的用户可见 id。 */
function createVirtualCssId(id: string): string {
  // 这里不能把真实路径明文放进 query。Vite 会在完整 id 中匹配 `.module.css`，
  // 如果 query 暴露源文件名，生成后的 atomic CSS 会被二次当成 CSS Modules 处理。
  return `${virtualCssPrefix}${encodeId(id)}`;
}

/** 从 resolved virtual CSS id 中解析真实源文件。 */
function decodeVirtualCssSource(id: string): string {
  const query = id.slice(resolvedVirtualCssPrefix.length);
  return decodeId(query);
}

/** 编码内部 JS virtual module source，避免 id 中出现 .css 被 Vite CSS 插件误判。 */
function encodeId(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

/** 解码内部 JS virtual module source。 */
function decodeId(id: string): string {
  return Buffer.from(id, 'base64url').toString('utf8');
}

/** 根据命令补齐 core className 策略。 */
function resolveCoreOptions(
  options: ResolvedSemanticAtomicCssOptions,
  command: ResolvedConfig['command']
): TransformCssOptions {
  return {
    ...options.core,
    className: {
      strategy: options.core.className?.strategy ?? (command === 'build' ? 'hash' : 'readable'),
      prefix: options.core.className?.prefix
    }
  };
}

/** 创建 build 阶段全局聚合 CSS。 */
function createBuildCss(
  transformer: Transformer,
  buildOrder: string[],
  buildResults: Map<string, CssModuleTransformResult>
): string {
  const preservedCss = buildOrder.map((id) => buildResults.get(id)?.transform.css.preserved ?? '');
  return joinCss([transformer.getAtomicCss(), ...preservedCss]);
}

/** 创建 build JSON report，并附加 Phase 4 analyzer 结构化分析。 */
function createBuildReport(
  transformer: Transformer,
  buildOrder: string[],
  buildResults: Map<string, CssModuleTransformResult>,
  outputCss: string
): TransformReport & { analysis: BuildAnalysis } {
  const report = transformer.getReport();
  const manifest = transformer.getManifest();
  const modules = buildOrder
    .map((id) => buildResults.get(id))
    .filter((result): result is CssModuleTransformResult => Boolean(result))
    .map((result) => ({
      id: result.id,
      sourceCss: result.sourceCss,
      scopedCss: result.scopedCss,
      atomicCss: result.transform.css.atomic,
      preservedCss: result.transform.css.preserved,
      diagnostics: result.transform.diagnostics
    }));

  return {
    ...report,
    analysis: analyzeBuild({
      report,
      manifest,
      modules,
      outputCss
    })
  };
}

/** 拼接 CSS 片段并保持空片段不输出。 */
function joinCss(chunks: string[]): string {
  return chunks
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .join('\n\n');
}

/** 把全局 CSS asset 注入 Vite 生成的 HTML。 */
function injectCssIntoHtml(bundle: Record<string, unknown>, cssFileName: string): void {
  for (const asset of Object.values(bundle)) {
    if (!isHtmlAsset(asset)) {
      continue;
    }

    const href = createHtmlRelativeHref(asset.fileName, cssFileName);

    if (asset.source.includes(href)) {
      continue;
    }

    asset.source = injectCssLinkIntoHtmlSource(asset.source, href);
  }
}

/** 构建写盘后兜底注入全局 CSS link，适配 Vite HTML asset 生成顺序。 */
async function injectCssIntoWrittenHtml(outDir: string, cssFileName: string): Promise<void> {
  const htmlFiles = await findHtmlFiles(outDir);

  for (const htmlFile of htmlFiles) {
    const source = await fs.readFile(htmlFile, 'utf8');
    const relativeHtml = path.posix.relative(normalizeToPosix(outDir), normalizeToPosix(htmlFile));
    const href = createHtmlRelativeHref(relativeHtml, cssFileName);

    if (source.includes(href)) {
      continue;
    }

    const nextSource = injectCssLinkIntoHtmlSource(source, href);
    await fs.writeFile(htmlFile, nextSource);
  }
}

/** 向 HTML 字符串注入全局 CSS link。 */
function injectCssLinkIntoHtmlSource(source: string, href: string): string {
  const link = `<link rel="stylesheet" href="${href}">`;

  if (source.includes(href)) {
    return source;
  }

  return source.includes('</head>') ? source.replace(/\s*<\/head>/, `\n    ${link}\n  </head>`) : `${link}\n${source}`;
}

/** 递归查找 build 输出中的 HTML 文件。 */
async function findHtmlFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await findHtmlFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(entryPath);
    }
  }

  return files;
}

/** 判断 bundle 条目是否是可修改的 HTML asset。 */
function isHtmlAsset(value: unknown): value is { type: 'asset'; fileName: string; source: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'fileName' in value &&
    'source' in value &&
    value.type === 'asset' &&
    typeof value.fileName === 'string' &&
    value.fileName.endsWith('.html') &&
    typeof value.source === 'string'
  );
}

/** 计算 HTML 到 CSS asset 的相对 href。 */
function createHtmlRelativeHref(htmlFileName: string, cssFileName: string): string {
  const htmlDir = path.posix.dirname(htmlFileName);
  return path.posix.relative(htmlDir === '.' ? '' : htmlDir, cssFileName);
}

/** 把系统路径转换成 POSIX 路径。 */
function normalizeToPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

/** 等待一小段时间，用于 dev 队列排空和测试环境事件循环让步。 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** 输出 core diagnostics，并在同一次 dev/build 生命周期内去重。 */
function emitDiagnostics(
  context: { warn(warning: string): void },
  diagnostics: Diagnostic[],
  options: ResolvedSemanticAtomicCssOptions,
  warnedDiagnostics: Set<string>
): void {
  if (!options.diagnostics.warn) {
    return;
  }

  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.id}:${diagnostic.code}:${diagnostic.reason ?? ''}:${diagnostic.selector ?? ''}`;

    if (warnedDiagnostics.has(key)) {
      continue;
    }

    warnedDiagnostics.add(key);
    context.warn(formatDiagnostic(diagnostic));
  }
}

/** 格式化 adapter 交给 Vite 展示的 warning。 */
function formatDiagnostic(diagnostic: Diagnostic): string {
  const location =
    diagnostic.source?.line !== undefined ? `:${diagnostic.source.line}:${diagnostic.source.column ?? 1}` : '';
  const selector = diagnostic.selector ? ` selector=${diagnostic.selector}` : '';
  const reason = diagnostic.reason ? ` reason=${diagnostic.reason}` : '';
  return `[semantic-atomic-css] ${diagnostic.id}${location} ${diagnostic.code}${reason}${selector} ${diagnostic.message}`;
}
