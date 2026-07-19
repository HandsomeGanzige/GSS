/**
 * GSS Vite plugin group 的 composition root 与 dev/build 生命周期实现。
 *
 * @remarks
 * pipeline plugin 位于 Vite CSS 编译和 css-post 之间；bridge plugin 只在 dev 注入 shared CSS owner。
 * 所有构建工具状态都保持在单个 plugin factory 闭包内，并在 buildStart 按生命周期重置。
 *
 * @module vite/plugin
 */
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
  createBrowserOverlayRuntime,
  createDevReportEnvelope,
  matchesDevReportRequest,
  type DevReportEnvelope
} from '@semantic-atomic-css/devtools';
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

/**
 * 创建接入 Vite 6 原生 CSS Modules 管线的 GSS 插件组。
 *
 * @remarks
 * 返回的 pipeline plugin 位于 `vite:css` 与 `vite:css-post` 之间，消费 Vite 已完成 scoping 和预处理的
 * CSS；bridge plugin 在 dev 中把 shared virtual CSS owner 注入原生 JS module。build 阶段会聚合稳定
 * 排序的 atomic/preserved CSS，并按配置输出 manifest 和带 analyzer 数据的 report。
 *
 * 当前不支持 named exports、strict mode、Lightning CSS transformer 和脱离 Vite 原生 tokens 的运行方式；
 * 这些配置会显式失败以避免 silent miscompile。普通 CSS 不会被拦截。
 *
 * @param options - 文件匹配、CSS Modules 继承、core、manifest/report 和 diagnostics 配置。
 * @returns 应直接加入 `plugins` 数组的 Vite plugin group。
 * @throws Vite 管线顺序不兼容、原生 tokens 缺失、资源引用无法安全还原或启用未支持配置时抛出错误。
 *
 * @example
 * ```ts
 * import { defineConfig } from 'vite';
 * import { semanticAtomicCss } from '@semantic-atomic-css/vite';
 *
 * export default defineConfig({
 *   plugins: [
 *     semanticAtomicCss({
 *       manifest: { enabled: true },
 *       report: { enabled: true }
 *     })
 *   ]
 * });
 * ```
 */
export function semanticAtomicCss(options: SemanticAtomicCssOptions = {}): PluginOption {
  const resolvedOptions = resolveOptions(options);
  const buildResults = new Map<string, CssModuleTransformResult>();
  const devResults = new Map<string, CssModuleTransformResult>();
  const nativeTokensById = new Map<string, CssModuleTokens>();
  const pendingDevTransforms = new Set<Promise<void>>();
  const devTransformGenerations = new Map<string, number>();
  const warnedDiagnostics = new Set<string>();
  let config: ResolvedConfig | undefined;
  let devServer: ViteDevServer | undefined;
  let buildTransformer: Transformer | undefined;
  let devTransformSession = 0;

  const pipelinePlugin: Plugin = {
    name: 'semantic-atomic-css:vite-pipeline',

    /**
     * 把 tokens capture callback 注入 Vite 原生 CSS Modules 配置。
     *
     * @param userConfig - 尚未 resolved 的 Vite 用户配置。
     * @returns 只覆盖 `css.modules` 的 partial config。
     */
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

    /**
     * 校验已解析配置和 plugin 顺序，并保存当前生命周期配置。
     *
     * @param resolvedConfig - Vite 最终 resolved config。
     * @throws 未支持配置或原生 CSS pipeline 顺序不兼容时抛错。
     */
    configResolved(resolvedConfig): void {
      validatePhase4Options(resolvedConfig, resolvedOptions);
      validateNativePipelineOrder(resolvedConfig);
      config = resolvedConfig;
    },

    /**
     * 保存 dev server，供 shared CSS reload 与 HMR graph 失效使用。
     *
     * @param server - 当前 Vite dev server。
     */
    configureServer(server): void {
      devServer = server;

      if (resolvedOptions.devtools.enabled) {
        server.middlewares.use((request, response, next) => {
          if (request.method !== 'GET' || !matchesDevReportRequest(request.url, resolvedOptions.devtools.endpoint)) {
            next();
            return;
          }

          void waitForDevTransformIdle(pendingDevTransforms)
            .then(() => {
              const payload = createViteDevReport(devResults, resolvedOptions);
              response.statusCode = 200;
              response.setHeader('content-type', 'application/json; charset=utf-8');
              response.setHeader('cache-control', 'no-store');
              response.end(`${JSON.stringify(payload, null, 2)}\n`);
            })
            .catch(next);
        });
      }
    },

    /**
     * 初始化一次 build 的可变状态。
     *
     * @remarks
     * 每次 build 都创建新的 append-only core transformer，避免跨 build 泄漏 registry。
     */
    buildStart(): void {
      buildResults.clear();
      nativeTokensById.clear();
      devTransformSession += 1;
      devTransformGenerations.clear();
      warnedDiagnostics.clear();
      buildTransformer = createTransformer(resolveCoreOptions(resolvedOptions, 'build'));
    },

    /**
     * 解析 shared dev CSS virtual module id。
     *
     * @param id - Vite 请求 id。
     * @returns 命中公开或内部 id 时返回内部 id，否则返回 `null`。
     */
    resolveId(id): string | null {
      if (id === virtualDevCssId || id === resolvedVirtualDevCssId) {
        return resolvedVirtualDevCssId;
      }

      return null;
    },

    /**
     * 加载 shared dev CSS virtual module。
     *
     * @param id - 已解析 module id。
     * @returns 当前 dev snapshot CSS；非目标 id 返回 `null`。
     */
    async load(id): Promise<string | null> {
      if (id === resolvedVirtualDevCssId) {
        return loadDevVirtualCss(devResults, pendingDevTransforms);
      }

      return null;
    },

    /**
     * 消费 Vite 已编译的 CSS Module 并增强其原生 tokens。
     *
     * @param scopedCss - `vite:css` 产生的 compiled scoped CSS。
     * @param id - 当前 Vite module id。
     * @returns 空 code 以阻止 scoped CSS 重复进入 Vite 原生 CSS asset；非目标文件返回 `null`。
     * @throws 无法取得原生 tokens 或 core/asset pipeline 失败时抛错。
     */
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

      const isDev = config.command === 'serve';
      const isNewDevModule = isDev && !hasTransformResult(devResults, file);
      const generation = readDevTransformGeneration(devTransformGenerations, file);
      const session = devTransformSession;
      const result = await trackDevTransform(
        config,
        pendingDevTransforms,
        (async () => {
          const sourceCss = await fs.readFile(file, 'utf8');
          return transformCompiledCssModule({
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
            devResults,
            shouldCommitDevResult: () =>
              session === devTransformSession &&
              generation === readDevTransformGeneration(devTransformGenerations, file)
          });
        })()
      );

      if (
        isDev &&
        (session !== devTransformSession ||
          generation !== readDevTransformGeneration(devTransformGenerations, file))
      ) {
        return { code: '', map: null };
      }

      Object.assign(tokens, result.tokens);
      emitDiagnostics(this, result.transform.diagnostics, resolvedOptions, warnedDiagnostics);

      if (isNewDevModule) {
        await reloadDevVirtualCssModule(devServer);
      }

      return { code: '', map: null };
    },

    /**
     * 失效 CSS Module 及预处理器依赖影响的 dev snapshot。
     *
     * @param context - Vite hot update context。
     * @returns 命中受影响 CSS Modules 时返回空 module 数组并触发 full reload，否则返回 `void`。
     */
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
        incrementDevTransformGeneration(devTransformGenerations, affectedFile);
      }

      invalidateDevCssModules(context.server, affectedModules, context.modules);
      invalidateDevVirtualCssModule(context.server);
      context.server.ws.send({ type: 'full-reload' });
      return [];
    },

    /**
     * 在 build HTML transform 阶段注入聚合 CSS link。
     *
     * @param html - 当前 HTML source。
     * @returns 未产生 build CSS 时原样返回，否则返回包含 link 的 HTML。
     */
    transformIndexHtml(html) {
      if (config?.command === 'serve' && resolvedOptions.devtools.overlay) {
        return {
          html,
          tags: [
            {
              tag: 'script',
              attrs: {
                type: 'module',
                'data-semantic-atomic-css-overlay-runtime': ''
              },
              children: createBrowserOverlayRuntime({
                endpoint: resolvedOptions.devtools.endpoint,
                pollIntervalMs: resolvedOptions.devtools.pollIntervalMs
              }),
              injectTo: 'head'
            }
          ]
        };
      }

      if (!config || config.command !== 'build' || buildResults.size === 0) {
        return html;
      }

      return injectCssLinkIntoHtmlSource(html, buildCssFileName);
    },

    /**
     * 生成聚合 CSS、manifest 和 report assets。
     *
     * @param _outputOptions - 当前 Rollup output options；本实现不读取。
     * @param bundle - 可注入 HTML link 的当前 bundle。
     * @throws 资源 placeholder 无法安全解析时终止 build。
     */
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

    /**
     * 对已写盘 HTML 执行 CSS link 兜底注入。
     *
     * @param outputOptions - 用于确定最终 outDir 的 Rollup output options。
     * @returns 所有 HTML 文件处理完成后的 Promise。
     * @throws 目录遍历或文件读写失败时透传文件系统异常。
     */
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

    /**
     * 在 dev CSS Module JS 中导入 shared virtual CSS owner。
     *
     * @param code - `vite:css-post` 生成的原生 JS module。
     * @param id - 当前 module id。
     * @returns 已登记 dev result 时返回增加 import 的代码，否则返回 `null`。
     */
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

/**
 * 在 dev 阶段登记正在执行的 CSS Module transform。
 *
 * @param config - 当前 Vite resolved config。
 * @param pendingDevTransforms - shared snapshot 等待的 pending 集合。
 * @param transform - 实际 transform promise。
 * @returns 原 transform 的结果或异常；build 模式不登记 pending。
 */
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

/**
 * `semanticAtomicCss` 的早期命名兼容别名。
 *
 * @deprecated 请改用 {@link semanticAtomicCss}；该别名只为已有调用方保留。
 */
export const semanticAtomicCssPlugin = semanticAtomicCss;

/**
 * 校验尚未实现或无法安全继承的配置。
 *
 * @param config - Vite resolved config。
 * @param options - GSS resolved options。
 * @throws strict、named exports、禁用原生 modules 或 Lightning CSS 等边界命中时抛错。
 */
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

/**
 * 校验 GSS plugins 位于要求的 Vite CSS pipeline 位置。
 *
 * @param config - 包含最终 plugins 顺序的 Vite resolved config。
 * @throws 缺失目标 plugin 或顺序不是 css、pipeline、css-post、bridge 时抛错。
 */
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

/**
 * 创建配置保护使用的结构化错误。
 *
 * @param input - 稳定 feature/id 和面向维护者的 reason。
 * @returns 带统一 unsupported-feature 文本格式的 Error。
 */
function createUnsupportedFeatureError(input: { feature: string; id: string; reason: string }): Error {
  return new Error(
    `[semantic-atomic-css] unsupported-feature feature=${input.feature} id=${input.id} reason=${input.reason}`
  );
}

/**
 * 判断 Route A 是否会继承 Vite named exports。
 *
 * @param config - Vite resolved config。
 * @param options - GSS resolved options。
 * @returns GSS 未显式覆盖 modules 且 Vite 开启 namedExports 时为 `true`。
 */
function inheritsViteNamedExports(config: ResolvedConfig, options: ResolvedSemanticAtomicCssOptions): boolean {
  const modules = config.css.modules as ({ namedExports?: boolean } & Record<string, unknown>) | false | undefined;

  return (
    !options.modules.configured &&
    typeof modules === 'object' &&
    modules !== null &&
    modules.namedExports === true
  );
}

/**
 * 删除文件对应的 transform result。
 *
 * @param results - dev/build result cache。
 * @param file - 可能使用系统路径别名的文件 id。
 * @returns 实际删除的缓存键；未命中时返回 `undefined`。
 */
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

/**
 * 判断文件是否已有 transform result。
 *
 * @param results - result cache。
 * @param file - 可能使用系统路径别名的文件 id。
 * @returns 直接或规范化身份命中时为 `true`。
 */
function hasTransformResult(results: Map<string, CssModuleTransformResult>, file: string): boolean {
  if (results.has(file)) {
    return true;
  }

  const target = normalizeFileIdentity(file);
  return [...results.keys()].some((key) => normalizeFileIdentity(key) === target);
}

/**
 * 归一化文件身份。
 *
 * @param file - 文件系统路径。
 * @returns 绝对 POSIX 路径；macOS 上去除等价的 `/private` 前缀。
 */
function normalizeFileIdentity(file: string): string {
  const resolved = normalizeToPosix(path.resolve(file));
  return process.platform === 'darwin' && resolved.startsWith('/private/') ? resolved.slice('/private'.length) : resolved;
}

/** 读取单个 CSS Module 的失效代次，未登记时从 0 开始。 */
function readDevTransformGeneration(generations: Map<string, number>, file: string): number {
  return generations.get(normalizeFileIdentity(file)) ?? 0;
}

/** 只推进受影响文件的代次，避免误废弃无关模块的并发 transform。 */
function incrementDevTransformGeneration(generations: Map<string, number>, file: string): void {
  const identity = normalizeFileIdentity(file);
  generations.set(identity, (generations.get(identity) ?? 0) + 1);
}

/**
 * 从 Vite dependency graph 分别沿旧 dependency 与 importer 方向收集受影响 CSS Modules。
 *
 * @param file - 本次变化的文件。
 * @param contextModules - Vite 已关联的 hot update modules。
 * @param server - 当前 dev server。
 * @param config - Vite resolved config。
 * @param options - GSS resolved file filters。
 * @returns 需要清理 tokens/result 并重新 transform 的文件集合。
 */
function collectAffectedCssModules(
  file: string,
  contextModules: ModuleNode[],
  server: ViteDevServer,
  config: ResolvedConfig,
  options: ResolvedSemanticAtomicCssOptions
): Set<string> {
  const affectedFiles = new Set<string>();
  const rootModules = new Set<ModuleNode>(contextModules);
  for (const candidate of fileIdentityCandidates(file)) {
    const graphModules = server.moduleGraph.getModulesByFile(candidate);

    if (graphModules) {
      for (const moduleNode of graphModules) {
        rootModules.add(moduleNode);
      }
    }
  }

  if (isCssModuleFile(file, config.root, options)) {
    affectedFiles.add(file);
  }

  const queue: Array<{ moduleNode: ModuleNode; direction: 'dependencies' | 'importers' }> = [];
  for (const moduleNode of rootModules) {
    queue.push({ moduleNode, direction: 'dependencies' }, { moduleNode, direction: 'importers' });
  }
  const visitedDependencies = new Set<ModuleNode>();
  const visitedImporters = new Set<ModuleNode>();

  while (queue.length > 0) {
    const entry = queue.shift();

    if (!entry) {
      continue;
    }

    const { moduleNode, direction } = entry;
    const visited = direction === 'dependencies' ? visitedDependencies : visitedImporters;
    if (visited.has(moduleNode)) {
      continue;
    }
    visited.add(moduleNode);
    const candidate = moduleNode.file ?? readAbsoluteModuleId(moduleNode.id);

    if (candidate && isCssModuleFile(cleanRequestId(candidate), config.root, options)) {
      affectedFiles.add(cleanRequestId(candidate));
      continue;
    }

    if (direction === 'dependencies') {
      for (const dependency of moduleNode.importedModules) {
        // JS/TS 删除 import 时需要沿更新前的 outgoing edge 找到并清理旧 CSS result。
        if (dependency.importers.has(moduleNode)) {
          queue.push({ moduleNode: dependency, direction });
        }
      }
    } else {
      for (const importer of moduleNode.importers) {
        // additional watch file 可能保留旧 importer，只沿当前双向边反查 CSS consumer。
        if (importer.importedModules.has(moduleNode)) {
          queue.push({ moduleNode: importer, direction });
        }
      }
    }
  }

  return affectedFiles;
}

/**
 * 失效受影响的 Vite module graph nodes。
 *
 * @param server - 当前 dev server。
 * @param files - 受影响 CSS Module 文件。
 * @param contextModules - hot update 已提供的 graph nodes。
 */
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

/**
 * 从 module id 读取可信绝对文件路径。
 *
 * @param id - Vite module node id。
 * @returns 清理 query 后仍为绝对路径的 id，否则返回 `undefined`。
 */
function readAbsoluteModuleId(id: string | null): string | undefined {
  const cleaned = id ? cleanRequestId(id) : '';
  return cleaned && path.isAbsolute(cleaned) ? cleaned : undefined;
}

/**
 * 枚举文件在 Vite graph 中可能使用的身份。
 *
 * @param file - 文件系统路径。
 * @returns 非 macOS 只有绝对路径；macOS 同时包含 `/var` 与 `/private/var` 形式。
 */
function fileIdentityCandidates(file: string): string[] {
  const resolved = normalizeToPosix(path.resolve(file));

  if (process.platform !== 'darwin') {
    return [resolved];
  }

  return resolved.startsWith('/private/') ? [resolved, resolved.slice('/private'.length)] : [resolved, `/private${resolved}`];
}

/**
 * 失效 shared dev CSS virtual module。
 *
 * @param server - 当前 dev server。
 */
function invalidateDevVirtualCssModule(server: ViteDevServer): void {
  const moduleNode = server.moduleGraph.getModuleById(resolvedVirtualDevCssId);

  if (moduleNode) {
    server.moduleGraph.invalidateModule(moduleNode);
  }
}

/**
 * 首次登记新 CSS Module 后刷新 shared CSS owner。
 *
 * @param server - 当前 dev server；尚未配置 server 时安全跳过。
 * @returns reload 完成后的 Promise。
 */
async function reloadDevVirtualCssModule(server: ViteDevServer | undefined): Promise<void> {
  if (!server) {
    return;
  }

  const moduleNode = server.moduleGraph.getModuleById(resolvedVirtualDevCssId);

  if (moduleNode) {
    await server.reloadModule(moduleNode);
  }
}

/**
 * 转换单个 Vite compiled CSS Module。
 *
 * @param input - compiled CSS/tokens、resolved config/options 以及 dev/build stores。
 * @returns tokens 已追加 atomic classes 的完整 module result。
 */
async function transformCompiledCssModule(input: {
  compiled: CompiledCssModule;
  config: ResolvedConfig;
  options: ResolvedSemanticAtomicCssOptions;
  buildTransformer: Transformer | undefined;
  buildResults: Map<string, CssModuleTransformResult>;
  devResults: Map<string, CssModuleTransformResult>;
  shouldCommitDevResult: () => boolean;
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
  } else if (input.shouldCommitDevResult()) {
    input.devResults.set(input.compiled.id, result);
  }

  return result;
}

/**
 * 读取 shared dev CSS。
 *
 * @param devResults - 当前已提交的 module results。
 * @param pendingDevTransforms - 当前正在执行的 dev transforms。
 * @returns 等待短暂稳定后创建的全局 CSS snapshot。
 */
async function loadDevVirtualCss(
  devResults: Map<string, CssModuleTransformResult>,
  pendingDevTransforms: Set<Promise<void>>
): Promise<string> {
  await waitForDevTransformIdle(pendingDevTransforms);
  return createDevCss(devResults);
}

/**
 * 等待当前 dev transform 队列短暂排空。
 *
 * @remarks
 * 最长等待约一秒；达到 deadline 后会直接 resolve，不抛错。调用方随后使用当时已提交的 results
 * 创建 snapshot，因此该 deadline 是现有 dev 一致性模型的重要限制。
 *
 * @param pendingDevTransforms - trackDevTransform 管理的 pending promises。
 * @returns 队列排空或 deadline 到达后的 Promise。
 */
async function waitForDevTransformIdle(pendingDevTransforms: Set<Promise<void>>): Promise<void> {
  const deadline = Date.now() + 1_000;

  do {
    await delay(0);

    if (pendingDevTransforms.size === 0) {
      return;
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      return;
    }
    await waitForPromisesOrTimeout([...pendingDevTransforms], remainingMs);
  } while (pendingDevTransforms.size > 0 && Date.now() < deadline);
}

/** 等待当前 promises 或 deadline，提前完成时清理 timeout 避免轮询累积 timer。 */
async function waitForPromisesOrTimeout(promises: Promise<void>[], timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    void Promise.allSettled(promises).then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * 创建 dev 阶段的全局 CSS snapshot。
 *
 * @param devResults - 当前已提交的 module results。
 * @returns 去重 atomic CSS 后拼接各模块 preserved CSS 的文本。
 */
function createDevCss(devResults: Map<string, CssModuleTransformResult>): string {
  const atomic = createDevAtomicCss(devResults);
  const preservedCss = [...devResults.values()].map((result) => result.transform.css.preserved);
  return joinCss([atomic, ...preservedCss]);
}

/**
 * 创建 dev atomic CSS。
 *
 * @param devResults - 当前已提交的 module results。
 * @returns 按 key 去重并执行 adapter cascade 排序后的 CSS。
 */
function createDevAtomicCss(devResults: Map<string, CssModuleTransformResult>): string {
  return renderAtomicDeclarations(collectAtomicDeclarations(devResults.values()));
}

/**
 * 聚合多个 module results 的 atomic declarations。
 *
 * @param results - dev/build module result iterable。
 * @returns 按遍历首次出现顺序、以 atomic key 去重的 declarations。
 */
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

/**
 * 渲染 adapter 聚合的 atomic declarations。
 *
 * @param declarations - 尚未执行 adapter 级 cascade 排序的 declarations。
 * @returns 基础规则优先、条件规则随后并以空行分隔的 CSS。
 */
function renderAtomicDeclarations(declarations: AtomicDeclaration[]): string {
  return orderAtomicDeclarations(declarations).map((declaration) => renderAtomicDeclaration(declaration)).join('\n\n');
}

/**
 * 稳定分区并排序 atomic declarations。
 *
 * @param declarations - 按首次登记顺序去重的 declarations。
 * @returns 基础规则在前、条件规则在后，简单宽度断点按已验证覆盖顺序排列的新数组。
 */
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

/**
 * 在原条件槽位内重排简单宽度断点。
 *
 * @param entries - 带首次登记序号的条件 declarations。
 * @returns max/min width 分别按覆盖顺序替换原槽位，复杂条件保持原相对位置。
 */
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

/**
 * 比较同类简单宽度 breakpoint entries。
 *
 * @param left - 左侧 declaration 与原顺序。
 * @param right - 右侧 declaration 与原顺序。
 * @param kind - min 或 max width。
 * @returns max-width 从大到小、min-width 从小到大，同值按原顺序。
 */
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

/**
 * 解析已验证的简单宽度媒体条件。
 *
 * @param media - media params，不含 `@media`。
 * @returns 单一 min/max-width px 的 kind/pixels；其他表达式返回 `undefined`。
 */
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

/**
 * 渲染单条 atomic declaration。
 *
 * @param declaration - 带 class、declaration 和 context 的 atomic record。
 * @returns 恢复 pseudo、supports 和 media 的 CSS。
 */
function renderAtomicDeclaration(declaration: AtomicDeclaration): string {
  const selector = `.${declaration.className}${declaration.context.pseudo ?? ''}`;
  const rule = renderCssRule(selector, declaration.declaration);
  return wrapAtomicAtRules(rule, declaration);
}

/**
 * 渲染单 declaration CSS rule。
 *
 * @param selector - atomic selector。
 * @param declaration - 要输出的 declaration metadata。
 * @returns 与 core renderRule 格式一致的 rule。
 */
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

/**
 * 按 core 约定包装 atomic 条件上下文。
 *
 * @param css - 已渲染 atomic rule。
 * @param declaration - 提供 supports/media context 的 atomic record。
 * @returns 先 supports、后 media 包装的 CSS。
 */
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

/**
 * 给多行 CSS block 增加两空格缩进。
 *
 * @param css - 任意多行 CSS。
 * @returns 每行前置两个空格的文本。
 */
function indentCssBlock(css: string): string {
  return css
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

/**
 * 根据 Vite command 补齐 core class name 策略。
 *
 * @param options - GSS resolved options。
 * @param command - Vite serve 或 build command。
 * @returns build 默认 hash、serve 默认 readable 的 core options。
 */
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

/**
 * 创建 build 阶段全局聚合 CSS。
 *
 * @param buildResults - 当前 build module results。
 * @returns 按稳定 source id 聚合的 atomic 与 preserved CSS。
 */
function createBuildCss(buildResults: Map<string, CssModuleTransformResult>): string {
  const results = getStableBuildResults(buildResults);
  const atomicCss = renderAtomicDeclarations(collectAtomicDeclarations(results));
  const preservedCss = results.map((result) => result.transform.css.preserved);
  return joinCss([atomicCss, ...preservedCss]);
}

/**
 * 稳定排序 build results。
 *
 * @param buildResults - 可能按异步完成顺序写入的 result map。
 * @returns 按规范化 source id 排序的新数组。
 */
function getStableBuildResults(
  buildResults: Map<string, CssModuleTransformResult>
): CssModuleTransformResult[] {
  return [...buildResults.values()].sort((left, right) => {
    const leftId = normalizeFileIdentity(left.id);
    const rightId = normalizeFileIdentity(right.id);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
}

/**
 * 创建 build report 与 analyzer analysis。
 *
 * @param transformer - 当前 build 的 core transformer。
 * @param buildResults - 当前 build module results。
 * @param outputCss - 资源 placeholder 已解析的最终 CSS。
 * @returns 可直接 JSON 序列化的稳定 report。
 */
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

/**
 * 从可失效的 per-file dev results 重建一次 append-only 聚合视图。
 *
 * @remarks
 * dev cache 不能直接复用 build transformer；每次 API 请求按稳定 source id 重放当前快照，确保已删除
 * module 不会残留在 manifest/report 中，同时 analyzer 使用浏览器实际消费的 dev CSS。
 */
function createViteDevReport(
  devResults: Map<string, CssModuleTransformResult>,
  options: ResolvedSemanticAtomicCssOptions
): DevReportEnvelope {
  if (devResults.size === 0) {
    return createDevReportEnvelope('vite', []);
  }

  const transformer = createTransformer(resolveCoreOptions(options, 'serve'));

  for (const result of getStableBuildResults(devResults)) {
    const exportedClassNames = collectExportedClassNames(result.tokens, result.scopedCss);
    transformer.transformCss({
      id: result.id,
      css: result.scopedCss,
      scope: createCssModulesScopeStrategy(exportedClassNames),
      preserveClassNames: collectAssetPreserveClassNames(result.scopedCss, result.tokens)
    });
  }

  return createDevReportEnvelope('vite', [
    {
      name: 'client',
      report: createBuildReport(transformer, devResults, createDevCss(devResults))
    }
  ]);
}

/**
 * 规范化 report diagnostics 顺序。
 *
 * @param report - core 聚合 report。
 * @returns diagnostics 按 source location 和稳定字段排序的新 report。
 */
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

/**
 * 规范化 manifest 持久化顺序。
 *
 * @param manifest - core 聚合 manifest。
 * @returns keys、sources、unsafe reasons 均稳定排序且无共享数组引用的 manifest。
 */
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

/**
 * 比较 source locations。
 *
 * @param left - 左侧 id/line/column。
 * @param right - 右侧 id/line/column。
 * @returns 先规范化 id、再行列的 comparator 结果。
 */
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

/**
 * 使用不依赖 locale 的字典序比较文本。
 *
 * @param left - 左侧文本。
 * @param right - 右侧文本。
 * @returns 标准 comparator 结果。
 */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * 拼接非空 CSS chunks。
 *
 * @param chunks - atomic/preserved CSS 片段。
 * @returns trim 后以空行分隔的 CSS。
 */
function joinCss(chunks: string[]): string {
  return chunks
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .join('\n\n');
}

/**
 * 把全局 CSS asset link 注入 bundle HTML assets。
 *
 * @param bundle - generateBundle 当前 bundle。
 * @param cssFileName - 聚合 CSS asset 文件名。
 */
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

/**
 * 对写盘后的 HTML 执行 CSS link 兜底注入。
 *
 * @param outDir - build 输出目录。
 * @param cssFileName - 聚合 CSS asset 文件名。
 * @returns 所有 HTML 文件读写完成后的 Promise。
 * @throws 目录遍历或文件读写失败时透传异常。
 */
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

/**
 * 向 HTML source 注入全局 CSS link。
 *
 * @param source - HTML 文本。
 * @param href - 相对当前 HTML 的 CSS href。
 * @returns 已存在 href 时原样返回；否则优先插入 `</head>` 前。
 */
function injectCssLinkIntoHtmlSource(source: string, href: string): string {
  const link = `<link rel="stylesheet" href="${href}">`;

  if (source.includes(href)) {
    return source;
  }

  return source.includes('</head>') ? source.replace(/\s*<\/head>/, `\n    ${link}\n  </head>`) : `${link}\n${source}`;
}

/**
 * 递归查找 build 输出中的 HTML 文件。
 *
 * @param dir - 当前遍历目录。
 * @returns 当前目录树中所有 `.html` 文件路径。
 * @throws 目录读取失败时透传文件系统异常。
 */
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

/**
 * 判断 bundle 条目是否是可修改 HTML asset。
 *
 * @param value - 未知 bundle entry。
 * @returns entry 是 string-source HTML asset 时收窄类型。
 */
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

/**
 * 计算 HTML 到 CSS asset 的相对 href。
 *
 * @param htmlFileName - bundle 内 HTML 路径。
 * @param cssFileName - bundle 内 CSS 路径。
 * @returns 从 HTML 所在目录到 CSS 的 POSIX relative path。
 */
function createHtmlRelativeHref(htmlFileName: string, cssFileName: string): string {
  const htmlDir = path.posix.dirname(htmlFileName);
  return path.posix.relative(htmlDir === '.' ? '' : htmlDir, cssFileName);
}

/**
 * 把系统路径转换为 POSIX 文本。
 *
 * @param value - 任意系统路径。
 * @returns 反斜杠替换为正斜杠的文本。
 */
function normalizeToPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

/**
 * 创建事件循环延迟。
 *
 * @param ms - 等待毫秒数。
 * @returns 指定 timer 完成后的 Promise。
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 把 core diagnostics 输出为 Vite warnings。
 *
 * @param context - 提供 Vite `warn` 的 plugin context。
 * @param diagnostics - 当前 transform diagnostics。
 * @param options - diagnostics 配置。
 * @param warnedDiagnostics - 当前生命周期去重集合。
 */
function emitDiagnostics(
  context: {
    /**
     * 把格式化后的 compiler diagnostic 交给 Vite warning 通道。
     *
     * @param warning - 包含 source id、code、reason 与位置的 warning 文本。
     * @returns 无返回值。
     */
    warn(warning: string): void;
  },
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

/**
 * 格式化 Vite warning。
 *
 * @param diagnostic - core 结构化 diagnostic。
 * @returns 包含 id、位置、code、reason、selector 和 message 的单行文本。
 */
function formatDiagnostic(diagnostic: Diagnostic): string {
  const location =
    diagnostic.source?.line !== undefined ? `:${diagnostic.source.line}:${diagnostic.source.column ?? 1}` : '';
  const selector = diagnostic.selector ? ` selector=${diagnostic.selector}` : '';
  const reason = diagnostic.reason ? ` reason=${diagnostic.reason}` : '';
  return `[semantic-atomic-css] ${diagnostic.id}${location} ${diagnostic.code}${reason}${selector} ${diagnostic.message}`;
}
