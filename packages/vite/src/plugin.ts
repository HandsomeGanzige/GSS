import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ModuleNode, Plugin, PluginOption, ResolvedConfig, ViteDevServer } from 'vite';
import {
  createTransformer,
  transformCss,
  type AtomicDeclaration,
  type Diagnostic,
  type TransformCssOptions,
  type TransformCssResult,
  type TransformManifest,
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
  createNativeCssModulesOptions,
  isCssModuleFile,
  type CssModuleTokens
} from './cssModules.js';
import { collectAssetPreserveClassNames, resolveBuildAssetReferences } from './assetReferences.js';
import { resolveOptions } from './options.js';
import type { ResolvedSemanticAtomicCssOptions, SemanticAtomicCssOptions } from './types.js';

const virtualDevCssId = 'virtual:semantic-atomic-css/dev.css';
const resolvedVirtualDevCssId = '\0semantic-atomic-css/dev.css';
const buildCssFileName = 'assets/semantic-atomic.css';

/** build adapter 内部的编译结果边界，不向 core 泄漏 Vite 语义。 */
type CompiledCssModule = {
  id: string;
  sourceCss: string;
  scopedCss: string;
  tokens: CssModuleTokens;
};

/** 单个 CSS Module 在 Vite 原生管线下的完整转换结果。 */
type CssModuleTransformResult = CompiledCssModule & {
  transform: TransformCssResult;
};

/** 创建 Vite adapter 插件组。 */
export function semanticAtomicCss(options: SemanticAtomicCssOptions = {}): PluginOption {
  const resolvedOptions = resolveOptions(options);
  const buildResults = new Map<string, CssModuleTransformResult>();
  const devResults = new Map<string, CssModuleTransformResult>();
  const nativeTokensById = new Map<string, CssModuleTokens>();
  const pendingDevTransforms = new Set<Promise<void>>();
  const warnedDiagnostics = new Set<string>();
  let config: ResolvedConfig | undefined;
  let devServer: ViteDevServer | undefined;
  let buildTransformer: Transformer | undefined;

  const pipelinePlugin: Plugin = {
    name: 'semantic-atomic-css:vite-pipeline',

    config(userConfig) {
      return {
        css: {
          modules: createNativeCssModulesOptions(
            userConfig.css?.modules,
            resolvedOptions,
            (id, tokens) => {
              nativeTokensById.set(normalizeFileIdentity(id), tokens);
            }
          )
        }
      };
    },

    configResolved(resolvedConfig): void {
      validatePhase4Options(resolvedConfig, resolvedOptions);
      validateNativePipelineOrder(resolvedConfig);
      config = resolvedConfig;
    },

    configureServer(server): void {
      devServer = server;
    },

    buildStart(): void {
      buildResults.clear();
      nativeTokensById.clear();
      pendingDevTransforms.clear();
      warnedDiagnostics.clear();
      buildTransformer = createTransformer(resolveCoreOptions(resolvedOptions, 'build'));
    },

    resolveId(id): string | null {
      if (id === virtualDevCssId || id === resolvedVirtualDevCssId) {
        return resolvedVirtualDevCssId;
      }

      return null;
    },

    async load(id): Promise<string | null> {
      if (id === resolvedVirtualDevCssId) {
        return loadDevVirtualCss(devResults, pendingDevTransforms);
      }

      return null;
    },

    async transform(scopedCss, id) {
      const file = cleanRequestId(id);

      if (!config || !isCssModuleFile(file, config.root, resolvedOptions)) {
        return null;
      }

      const tokens = nativeTokensById.get(normalizeFileIdentity(file));

      if (!tokens) {
        throw new Error(
          `[semantic-atomic-css] ${file} 未能从 Vite 原生 CSS Modules 管线获取 tokens，已停止构建以避免 silent miscompile。`
        );
      }

      const isNewDevModule = config.command === 'serve' && !hasTransformResult(devResults, file);
      const sourceCss = await fs.readFile(file, 'utf8');
      const result = await trackDevTransform(
        config,
        pendingDevTransforms,
        transformCompiledCssModule({
          compiled: {
            id: file,
            sourceCss,
            scopedCss,
            tokens
          },
          config,
          options: resolvedOptions,
          buildTransformer,
          buildResults,
          devResults
        })
      );

      Object.assign(tokens, result.tokens);
      emitDiagnostics(this, result.transform.diagnostics, resolvedOptions, warnedDiagnostics);

      if (isNewDevModule) {
        await reloadDevVirtualCssModule(devServer);
      }

      return { code: '', map: null };
    },

    handleHotUpdate(context): [] | void {
      const file = cleanRequestId(context.file);

      if (!config) {
        return;
      }

      const affectedModules = collectAffectedCssModules(
        file,
        context.modules,
        context.server,
        config,
        resolvedOptions
      );

      if (affectedModules.size === 0) {
        return;
      }

      for (const affectedFile of affectedModules) {
        deleteTransformResult(devResults, affectedFile);
        nativeTokensById.delete(normalizeFileIdentity(affectedFile));
      }

      pendingDevTransforms.clear();
      invalidateDevCssModules(context.server, affectedModules, context.modules);
      invalidateDevVirtualCssModule(context.server);
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
      if (!config || !buildTransformer || buildResults.size === 0) {
        return;
      }

      const css = resolveBuildAssetReferences(
        createBuildCss(buildResults),
        config,
        buildCssFileName,
        (referenceId) => this.getFileName(referenceId)
      );

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
          source: JSON.stringify(stabilizeManifest(buildTransformer.getManifest()), null, 2)
        });
      }

      if (resolvedOptions.report.enabled) {
        this.emitFile({
          type: 'asset',
          fileName: resolvedOptions.report.filename,
          source: JSON.stringify(createBuildReport(buildTransformer, buildResults, css), null, 2)
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

  const bridgePlugin: Plugin = {
    name: 'semantic-atomic-css:vite-bridge',
    enforce: 'post',

    transform(code, id) {
      const file = cleanRequestId(id);

      if (!config || config.command !== 'serve' || !hasTransformResult(devResults, file)) {
        return null;
      }

      return {
        code: `import ${JSON.stringify(virtualDevCssId)};\n${code}`,
        map: null
      };
    }
  };

  return [pipelinePlugin, bridgePlugin];
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
        'Vite css.modules: false 会阻止原生管线产生 CSS Modules tokens，请启用 css.modules 或显式配置 semanticAtomicCss({ modules: {} })。'
    });
  }

  if (config.css.transformer === 'lightningcss') {
    throw createUnsupportedFeatureError({
      feature: 'vite.css.transformer.lightningcss',
      id: 'vite.css.transformer',
      reason: 'Phase 5 仅验证 Vite 6 默认 PostCSS Modules 管线，暂不接管 Lightning CSS tokens。'
    });
  }
}

/** 校验 GSS 确实位于 Vite CSS 编译与 JS module 生成之间，避免版本升级后静默错位。 */
function validateNativePipelineOrder(config: ResolvedConfig): void {
  const pluginNames = config.plugins.map((plugin) => plugin.name);
  const cssIndex = pluginNames.indexOf('vite:css');
  const pipelineIndex = pluginNames.indexOf('semantic-atomic-css:vite-pipeline');
  const cssPostIndex = pluginNames.indexOf('vite:css-post');
  const bridgeIndex = pluginNames.indexOf('semantic-atomic-css:vite-bridge');

  if (
    cssIndex === -1 ||
    pipelineIndex === -1 ||
    cssPostIndex === -1 ||
    bridgeIndex === -1 ||
    !(cssIndex < pipelineIndex && pipelineIndex < cssPostIndex && cssPostIndex < bridgeIndex)
  ) {
    throw createUnsupportedFeatureError({
      feature: 'vite.css-plugin-order',
      id: 'vite.config.plugins',
      reason: `期望 vite:css < GSS pipeline < vite:css-post < GSS bridge，实际顺序为 ${pluginNames.join(' -> ')}。`
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

/** 删除指定文件的 transform 结果，并返回真实缓存键以便同步失效 Vite module graph。 */
function deleteTransformResult(results: Map<string, CssModuleTransformResult>, file: string): string | undefined {
  if (results.delete(file)) {
    return file;
  }

  const target = normalizeFileIdentity(file);

  for (const key of results.keys()) {
    if (normalizeFileIdentity(key) === target) {
      results.delete(key);
      return key;
    }
  }

  return undefined;
}

/** 判断指定文件是否已有 transform 结果，并兼容 macOS /var 与 /private/var 路径别名。 */
function hasTransformResult(results: Map<string, CssModuleTransformResult>, file: string): boolean {
  if (results.has(file)) {
    return true;
  }

  const target = normalizeFileIdentity(file);
  return [...results.keys()].some((key) => normalizeFileIdentity(key) === target);
}

/** 归一化文件身份，避免同一文件因系统路径别名无法命中缓存。 */
function normalizeFileIdentity(file: string): string {
  const resolved = normalizeToPosix(path.resolve(file));
  return process.platform === 'darwin' && resolved.startsWith('/private/') ? resolved.slice('/private'.length) : resolved;
}

/** 从 Vite 原生 dependency graph 向上遍历，找到 partial 变更影响的所有 CSS Modules。 */
function collectAffectedCssModules(
  file: string,
  contextModules: ModuleNode[],
  server: ViteDevServer,
  config: ResolvedConfig,
  options: ResolvedSemanticAtomicCssOptions
): Set<string> {
  const affectedFiles = new Set<string>();
  const queuedModules = new Set<ModuleNode>(contextModules);
  for (const candidate of fileIdentityCandidates(file)) {
    const graphModules = server.moduleGraph.getModulesByFile(candidate);

    if (graphModules) {
      for (const moduleNode of graphModules) {
        queuedModules.add(moduleNode);
      }
    }
  }

  if (isCssModuleFile(file, config.root, options)) {
    affectedFiles.add(file);
  }

  const queue = [...queuedModules];
  const visited = new Set<ModuleNode>();

  while (queue.length > 0) {
    const moduleNode = queue.shift();

    if (!moduleNode || visited.has(moduleNode)) {
      continue;
    }

    visited.add(moduleNode);
    const candidate = moduleNode.file ?? readAbsoluteModuleId(moduleNode.id);

    if (candidate && isCssModuleFile(cleanRequestId(candidate), config.root, options)) {
      affectedFiles.add(cleanRequestId(candidate));
      continue;
    }

    for (const importer of moduleNode.importers) {
      // Vite 某些 additional watch file 节点会短暂保留旧 importer，只沿当前双向边遍历。
      if (importer.importedModules.has(moduleNode)) {
        queue.push(importer);
      }
    }
  }

  return affectedFiles;
}

/** CSS Module HMR 时失效原生 module nodes，确保 full reload 重新生成 tokens。 */
function invalidateDevCssModules(
  server: ViteDevServer,
  files: Set<string>,
  contextModules: ModuleNode[]
): void {
  const modules = new Set(contextModules);

  for (const file of files) {
    for (const candidate of fileIdentityCandidates(file)) {
      const graphModules = server.moduleGraph.getModulesByFile(candidate);

      if (graphModules) {
        for (const moduleNode of graphModules) {
          modules.add(moduleNode);
        }
      }
    }
  }

  for (const moduleNode of modules) {
    server.moduleGraph.invalidateModule(moduleNode);
  }
}

/** 只把 module graph 中的绝对文件 id 当作文件路径，避免把 /src URL 误判为系统根路径。 */
function readAbsoluteModuleId(id: string | null): string | undefined {
  const cleaned = id ? cleanRequestId(id) : '';
  return cleaned && path.isAbsolute(cleaned) ? cleaned : undefined;
}

/** 枚举 macOS 上 /var 与 /private/var 的等价路径，保证 Vite graph 查找与缓存身份一致。 */
function fileIdentityCandidates(file: string): string[] {
  const resolved = normalizeToPosix(path.resolve(file));

  if (process.platform !== 'darwin') {
    return [resolved];
  }

  return resolved.startsWith('/private/') ? [resolved, resolved.slice('/private'.length)] : [resolved, `/private${resolved}`];
}

/** CSS Module HMR 时让单一 dev CSS owner 失效，避免 full reload 前后复用旧快照。 */
function invalidateDevVirtualCssModule(server: ViteDevServer): void {
  const moduleNode = server.moduleGraph.getModuleById(resolvedVirtualDevCssId);

  if (moduleNode) {
    server.moduleGraph.invalidateModule(moduleNode);
  }
}

/** 新 CSS Module 首次登记后刷新已加载的 shared CSS owner，使浏览器取得最新全局快照。 */
async function reloadDevVirtualCssModule(server: ViteDevServer | undefined): Promise<void> {
  if (!server) {
    return;
  }

  const moduleNode = server.moduleGraph.getModuleById(resolvedVirtualDevCssId);

  if (moduleNode) {
    await server.reloadModule(moduleNode);
  }
}

/** 消费构建工具已编译的 CSS Module，并维护 GSS dev/build 状态。 */
async function transformCompiledCssModule(input: {
  compiled: CompiledCssModule;
  config: ResolvedConfig;
  options: ResolvedSemanticAtomicCssOptions;
  buildTransformer: Transformer | undefined;
  buildResults: Map<string, CssModuleTransformResult>;
  devResults: Map<string, CssModuleTransformResult>;
}): Promise<CssModuleTransformResult> {
  if (input.config.command === 'build') {
    const cached = input.buildResults.get(input.compiled.id);

    if (cached) {
      return cached;
    }
  }

  const exportedClassNames = collectExportedClassNames(input.compiled.tokens, input.compiled.scopedCss);
  const scope = createCssModulesScopeStrategy(exportedClassNames);
  const coreInput = {
    id: input.compiled.id,
    css: input.compiled.scopedCss,
    scope,
    preserveClassNames: collectAssetPreserveClassNames(input.compiled.scopedCss, input.compiled.tokens)
  };
  const transform =
    input.config.command === 'build' && input.buildTransformer
      ? input.buildTransformer.transformCss(coreInput)
      : transformCss(coreInput, resolveCoreOptions(input.options, 'serve'));
  const result: CssModuleTransformResult = {
    ...input.compiled,
    tokens: augmentCssModuleTokens(input.compiled.tokens, transform.classes),
    transform
  };

  if (input.config.command === 'build') {
    input.buildResults.set(input.compiled.id, result);
  } else {
    input.devResults.set(input.compiled.id, result);
  }

  return result;
}

/** 读取 dev virtual CSS 内容，并等待当前并发 transform 排空后再创建全局快照。 */
async function loadDevVirtualCss(
  devResults: Map<string, CssModuleTransformResult>,
  pendingDevTransforms: Set<Promise<void>>
): Promise<string> {
  await waitForDevTransformIdle(pendingDevTransforms);
  return createDevCss(devResults);
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

/** 创建 dev 阶段由单一 virtual CSS owner 持有的全局快照，避免多个 style tag 重复注入 atomic class。 */
function createDevCss(devResults: Map<string, CssModuleTransformResult>): string {
  const atomic = createDevAtomicCss(devResults);
  const preservedCss = [...devResults.values()].map((result) => result.transform.css.preserved);
  return joinCss([atomic, ...preservedCss]);
}

/** 聚合当前 dev 已知模块的 atomic declaration，并按 atomic key 去重。 */
function createDevAtomicCss(devResults: Map<string, CssModuleTransformResult>): string {
  return renderAtomicDeclarations(collectAtomicDeclarations(devResults.values()));
}

/** 聚合多个模块的 atomic declaration，并按 atomic key 保留首次登记项。 */
function collectAtomicDeclarations(results: Iterable<CssModuleTransformResult>): AtomicDeclaration[] {
  const declarations = new Map<string, AtomicDeclaration>();

  for (const result of results) {
    for (const declaration of result.transform.atomic) {
      if (!declarations.has(declaration.key)) {
        declarations.set(declaration.key, declaration);
      }
    }
  }

  return [...declarations.values()];
}

/** 渲染 adapter 内部聚合出来的 atomic declarations，并让条件上下文位于基础规则之后。 */
function renderAtomicDeclarations(declarations: AtomicDeclaration[]): string {
  return orderAtomicDeclarations(declarations).map((declaration) => renderAtomicDeclaration(declaration)).join('\n\n');
}

/** 稳定分区基础与条件规则，避免复用的媒体 key 早于后续模块基础规则而失效。 */
function orderAtomicDeclarations(declarations: AtomicDeclaration[]): AtomicDeclaration[] {
  const base: AtomicDeclaration[] = [];
  const contextual: Array<{ declaration: AtomicDeclaration; order: number }> = [];

  for (const [order, declaration] of declarations.entries()) {
    if (declaration.context.media || declaration.context.supports) {
      contextual.push({ declaration, order });
    } else {
      base.push(declaration);
    }
  }

  return [...base, ...orderSimpleWidthBreakpoints(contextual).map((entry) => entry.declaration)];
}

/** 只替换同类简单宽度条件的原槽位，避免复杂条件混排时产生不稳定 comparator。 */
function orderSimpleWidthBreakpoints(
  entries: Array<{ declaration: AtomicDeclaration; order: number }>
): Array<{ declaration: AtomicDeclaration; order: number }> {
  const maxEntries = entries
    .filter((entry) => readSimpleWidthBreakpoint(entry.declaration.context.media)?.kind === 'max')
    .sort((left, right) => compareSimpleWidthEntries(left, right, 'max'));
  const minEntries = entries
    .filter((entry) => readSimpleWidthBreakpoint(entry.declaration.context.media)?.kind === 'min')
    .sort((left, right) => compareSimpleWidthEntries(left, right, 'min'));
  let maxIndex = 0;
  let minIndex = 0;

  return entries.map((entry) => {
    const breakpoint = readSimpleWidthBreakpoint(entry.declaration.context.media);

    if (breakpoint?.kind === 'max') {
      return maxEntries[maxIndex++] ?? entry;
    }

    if (breakpoint?.kind === 'min') {
      return minEntries[minIndex++] ?? entry;
    }

    return entry;
  });
}

/** 比较同一种简单宽度条件，确保窄屏或高断点规则在后方覆盖。 */
function compareSimpleWidthEntries(
  left: { declaration: AtomicDeclaration; order: number },
  right: { declaration: AtomicDeclaration; order: number },
  kind: 'min' | 'max'
): number {
  const leftPixels = readSimpleWidthBreakpoint(left.declaration.context.media)?.pixels ?? 0;
  const rightPixels = readSimpleWidthBreakpoint(right.declaration.context.media)?.pixels ?? 0;
  const distance = kind === 'max' ? rightPixels - leftPixels : leftPixels - rightPixels;
  return distance || left.order - right.order;
}

/** 解析 MVP 常用的单一 min/max-width px 媒体条件，其他表达式不参与重排。 */
function readSimpleWidthBreakpoint(media: string | undefined): { kind: 'min' | 'max'; pixels: number } | undefined {
  const match = media?.match(/^\(\s*(min|max)-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/i);

  if (!match) {
    return undefined;
  }

  return {
    kind: match[1].toLowerCase() as 'min' | 'max',
    pixels: Number(match[2])
  };
}

/** 渲染单条 atomic declaration，并恢复其 @media/@supports 上下文。 */
function renderAtomicDeclaration(declaration: AtomicDeclaration): string {
  const selector = `.${declaration.className}${declaration.context.pseudo ?? ''}`;
  const rule = renderCssRule(selector, declaration.declaration);
  return wrapAtomicAtRules(rule, declaration);
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

/** 创建 build 阶段全局聚合 CSS，并使用稳定 source id 顺序消除并发 transform 漂移。 */
function createBuildCss(buildResults: Map<string, CssModuleTransformResult>): string {
  const results = getStableBuildResults(buildResults);
  const atomicCss = renderAtomicDeclarations(collectAtomicDeclarations(results));
  const preservedCss = results.map((result) => result.transform.css.preserved);
  return joinCss([atomicCss, ...preservedCss]);
}

/** 按规范化 source id 排序 build 结果，保证 CSS、fallback 与 analysis 使用同一稳定顺序。 */
function getStableBuildResults(
  buildResults: Map<string, CssModuleTransformResult>
): CssModuleTransformResult[] {
  return [...buildResults.values()].sort((left, right) => {
    const leftId = normalizeFileIdentity(left.id);
    const rightId = normalizeFileIdentity(right.id);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
}

/** 创建 build JSON report，并附加 Phase 4 analyzer 结构化分析。 */
function createBuildReport(
  transformer: Transformer,
  buildResults: Map<string, CssModuleTransformResult>,
  outputCss: string
): TransformReport & { analysis: BuildAnalysis } {
  const report = stabilizeReport(transformer.getReport());
  const manifest = stabilizeManifest(transformer.getManifest());
  const modules = getStableBuildResults(buildResults).map((result) => ({
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

/** 规范化 report diagnostics 顺序，避免并发 transform 完成顺序进入 JSON 产物。 */
function stabilizeReport(report: TransformReport): TransformReport {
  return {
    ...report,
    diagnostics: [...report.diagnostics].sort((left, right) => {
      const sourceOrder = compareSourceLocation(
        left.source ?? { id: left.id },
        right.source ?? { id: right.id }
      );

      if (sourceOrder !== 0) {
        return sourceOrder;
      }

      return compareText(
        [left.code, left.reason ?? '', left.selector ?? '', left.sourceClassName ?? ''].join('\0'),
        [right.code, right.reason ?? '', right.selector ?? '', right.sourceClassName ?? ''].join('\0')
      );
    })
  };
}

/** 规范化 manifest 键和 source 数组，并为共享 atomic declaration 选择稳定主来源。 */
function stabilizeManifest(manifest: TransformManifest): TransformManifest {
  const atomic = Object.fromEntries(
    Object.entries(manifest.atomic)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, entry]) => {
        const sources = [...entry.sources].sort(compareSourceLocation);
        return [
          key,
          {
            ...entry,
            declaration: {
              ...entry.declaration,
              source: sources[0] ? { ...sources[0] } : entry.declaration.source
            },
            context: { ...entry.context },
            sources: sources.map((source) => ({ ...source }))
          }
        ];
      })
  );
  const classes = Object.fromEntries(
    Object.entries(manifest.classes)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, entry]) => [
        key,
        {
          ...entry,
          atomicClassNames: [...entry.atomicClassNames],
          unsafeReasons: entry.unsafeReasons ? [...entry.unsafeReasons].sort(compareText) : undefined
        }
      ])
  );

  return { atomic, classes };
}

/** 按规范化文件、行和列比较 source location。 */
function compareSourceLocation(
  left: { id: string; line?: number; column?: number },
  right: { id: string; line?: number; column?: number }
): number {
  return (
    compareText(normalizeFileIdentity(left.id), normalizeFileIdentity(right.id)) ||
    (left.line ?? 0) - (right.line ?? 0) ||
    (left.column ?? 0) - (right.column ?? 0)
  );
}

/** 使用不依赖 locale 的字典序比较文本。 */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
