/**
 * Rsbuild plugin composition root、配置保护和 build/dev 生命周期。
 *
 * @module rsbuild/plugin
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  HtmlBasicTag,
  NormalizedEnvironmentConfig,
  RsbuildPlugin,
  Rspack
} from '@rsbuild/core';
import type { TransformCssOptions } from '@semantic-atomic-css/core';
import {
  createBrowserOverlayRuntime,
  createDevReportEnvelope,
  matchesDevReportRequest,
  type DevReportEnvelope
} from '@semantic-atomic-css/devtools';
import {
  createBuildArtifactSnapshot,
  createEnvironmentBuildState,
  recordRuntimeBridgeResult,
  resetEnvironmentBuildState,
  type EnvironmentBuildState
} from './buildArtifacts.js';
import { resolveOptions } from './options.js';
import type { RuntimeBridgeLoaderOptions } from './runtimeBridgeLoader.js';
import type { SemanticAtomicCssRsbuildOptions } from './types.js';

const pluginName = 'semantic-atomic-css:rsbuild';
const runtimeBridgeLoaderPath = fileURLToPath(new URL('./runtimeBridgeLoader.js', import.meta.url));

/**
 * 创建接入 Rsbuild 2.1 默认 css-loader/CssExtractRspackPlugin 管线的 GSS plugin。
 *
 * @remarks
 * loader bridge 使用公开 `importModule` 与 css-loader array export，在 extraction 前同时取得 scoped CSS
 * 和最终 default-export locals。build 将 safe declarations 聚合为共享 atomic CSS，原生 chunks 只保留
 * fallback；dev 使用 Rsbuild 官方 style injection 管线维持 module graph，同时由共享浏览器 runtime
 * 聚合 atomic/fallback CSS。该单层 `importModule` 路线保留 Rsbuild HMR/live-reload，并避开 Rspack 2.1
 * extraction 嵌套 `importModule` 在增量编译时的已验证 panic。
 *
 * 当前只支持 web target、default exports、Rsbuild 2.1 默认 css-loader array pipeline，且不承诺完整
 * CSS source map。命中 named exports、strict、非 web target 或被替换的 pipeline 时会 fail fast。
 */
export function pluginSemanticAtomicCss(options: SemanticAtomicCssRsbuildOptions = {}): RsbuildPlugin {
  const resolved = resolveOptions(options);
  const states = new Map<string, EnvironmentBuildState>();

  validatePublicOptions(resolved);

  return {
    name: pluginName,
    setup(api) {
      validateRsbuildVersion(api.context.version);

      api.modifyEnvironmentConfig((config, { mergeEnvironmentConfig }) => {
        if (api.context.action !== 'dev') {
          return config;
        }
        return mergeEnvironmentConfig(config, {
          output: {
            injectStyles: true
          }
        });
      });

      api.onBeforeEnvironmentCompile(({ environment }) => {
        resetEnvironmentBuildState(getEnvironmentState(states, environment.name, false));
      });

      if (resolved.devtools.enabled) {
        api.onBeforeStartDevServer(({ server }) => {
          server.middlewares.use((request, response, next) => {
            if (request.method !== 'GET' || !matchesDevReportRequest(request.url, resolved.devtools.endpoint)) {
              next();
              return;
            }

            try {
              const payload = createRsbuildDevReport(states, resolved.core);
              response.statusCode = 200;
              response.setHeader('content-type', 'application/json; charset=utf-8');
              response.setHeader('cache-control', 'no-store');
              response.end(`${JSON.stringify(payload, null, 2)}\n`);
            } catch (error) {
              next(error);
            }
          });
        });
      }

      api.modifyBundlerChain((chain, { CHAIN_ID, environment, isDev, target }) => {
        validateEnvironment(environment.config, target);
        const state = getEnvironmentState(states, environment.name, isDev);
        state.isDev = isDev;
        const core = resolveCoreOptions(resolved.core, isDev);
        const targets = [
          [CHAIN_ID.RULE.CSS, CHAIN_ID.ONE_OF.CSS_MAIN],
          [CHAIN_ID.RULE.SASS, CHAIN_ID.RULE.SASS],
          [CHAIN_ID.RULE.LESS, CHAIN_ID.RULE.LESS]
        ] as const;
        let installed = 0;

        for (const [ruleId, branchId] of targets) {
          if (!chain.module.rules.has(ruleId)) {
            continue;
          }

          const branch = chain.module.rule(ruleId).oneOf(branchId);
          if (!branch.uses.has(CHAIN_ID.USE.CSS)) {
            continue;
          }

          validateCssLoaderUse(branch.use(CHAIN_ID.USE.CSS).get('options'), environment.name);
          const loaderOptions: RuntimeBridgeLoaderOptions = {
            root: api.context.rootPath,
            include: [...resolved.include],
            exclude: [...resolved.exclude],
            core,
            isDev,
            warn: resolved.diagnostics.warn,
            onResult(result) {
              recordRuntimeBridgeResult(state, result);
            }
          };

          branch
            .use(`${pluginName}:${ruleId}`)
            .before(CHAIN_ID.USE.CSS)
            .loader(runtimeBridgeLoaderPath)
            .options(loaderOptions);
          installed += 1;
        }

        if (installed === 0) {
          throw createUnsupportedFeatureError(
            'rsbuild.css-loader-pipeline',
            environment.name,
            '未找到 Rsbuild 默认 css-loader main rule，无法安全安装 runtime bridge。'
          );
        }
      });

      api.modifyRspackConfig((config, { environment, isDev, appendPlugins, rspack }) => {
        if (isDev) {
          return config;
        }

        const state = getEnvironmentState(states, environment.name, false);
        appendPlugins(createBuildAssetsPlugin(rspack, state, resolved));
        return config;
      });

      api.modifyHTMLTags((tags, { assetPrefix, compilation, environment }) => {
        const state = states.get(environment.name);

        if (api.context.action === 'dev') {
          if (!resolved.devtools.overlay || hasOverlayRuntimeTag(tags.headTags)) {
            return tags;
          }

          return {
            ...tags,
            headTags: [
              ...tags.headTags,
              {
                tag: 'script',
                attrs: {
                  type: 'module',
                  'data-semantic-atomic-css-overlay-runtime': ''
                },
                children: createBrowserOverlayRuntime({
                  endpoint: resolved.devtools.endpoint,
                  pollIntervalMs: resolved.devtools.pollIntervalMs
                })
              }
            ]
          };
        }

        if (state?.isDev || !compilation.getAsset(resolved.cssFilename)) {
          return tags;
        }

        const href = joinAssetPrefix(assetPrefix, resolved.cssFilename);
        if (tags.headTags.some((tag) => tag.tag === 'link' && tag.attrs?.href === href)) {
          return tags;
        }

        const headTags = [...tags.headTags];
        const atomicTag: HtmlBasicTag = {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href
          }
        };
        const firstNativeCss = headTags.findIndex(
          (tag) => tag.tag === 'link' && tag.attrs?.rel === 'stylesheet'
        );

        if (firstNativeCss === -1) {
          headTags.push(atomicTag);
        } else {
          headTags.splice(firstNativeCss, 0, atomicTag);
        }

        return { ...tags, headTags };
      });
    }
  };
}

/** 从当前各 environment 可失效状态创建稳定的 dev report API 快照。 */
function createRsbuildDevReport(
  states: Map<string, EnvironmentBuildState>,
  coreOptions: TransformCssOptions
): DevReportEnvelope {
  const environments = [...states.entries()]
    .filter(([, state]) => state.isDev && state.inputs.size > 0)
    .map(([name, state]) => ({
      name,
      report: createBuildArtifactSnapshot(state, resolveCoreOptions(coreOptions, true)).report
    }));

  return createDevReportEnvelope('rsbuild', environments);
}

/** 判断 Rsbuild HTML tags 中是否已经注入当前 overlay runtime。 */
function hasOverlayRuntimeTag(tags: HtmlBasicTag[]): boolean {
  return tags.some(
    (tag) => tag.tag === 'script' && tag.attrs?.['data-semantic-atomic-css-overlay-runtime'] !== undefined
  );
}

/** 创建只在 build processAssets 阶段 emit 共享产物的 Rspack plugin。 */
function createBuildAssetsPlugin(
  rspack: typeof import('@rsbuild/core')['rspack'],
  state: EnvironmentBuildState,
  options: ReturnType<typeof resolveOptions>
): Rspack.Plugin {
  return {
    apply(compiler: Rspack.Compiler) {
      compiler.hooks.thisCompilation.tap(pluginName, (compilation: Rspack.Compilation) => {
        compilation.hooks.processAssets.tap(
          {
            name: pluginName,
            stage: rspack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS
          },
          () => {
            if (state.inputs.size === 0) {
              return;
            }

            const snapshot = createBuildArtifactSnapshot(
              state,
              resolveCoreOptions(options.core, false),
              {
                manifest: options.manifest.enabled,
                report: options.report.enabled
              }
            );

            if (snapshot.atomicCss.trim()) {
              emitUniqueAsset(compilation, rspack, options.cssFilename, snapshot.atomicCss);
            }
            if (options.manifest.enabled) {
              if (!snapshot.manifest) {
                throw new Error('[semantic-atomic-css] missing-build-manifest-snapshot');
              }
              emitUniqueAsset(
                compilation,
                rspack,
                options.manifest.filename,
                `${JSON.stringify(snapshot.manifest, null, 2)}\n`
              );
            }
            if (options.report.enabled) {
              if (!snapshot.report) {
                throw new Error('[semantic-atomic-css] missing-build-report-snapshot');
              }
              emitUniqueAsset(
                compilation,
                rspack,
                options.report.filename,
                `${JSON.stringify(snapshot.report, null, 2)}\n`
              );
            }
          }
        );
      });
    }
  };
}

/** emit 前保护同名原生产物，避免覆盖用户 CSS/JSON。 */
function emitUniqueAsset(
  compilation: Rspack.Compilation,
  rspack: typeof import('@rsbuild/core')['rspack'],
  filename: string,
  source: string
): void {
  if (compilation.getAsset(filename)) {
    throw new Error(`[semantic-atomic-css] asset-conflict filename=${filename}`);
  }
  compilation.emitAsset(filename, new rspack.sources.RawSource(source));
}

/** 读取或创建 environment 独立 state。 */
function getEnvironmentState(
  states: Map<string, EnvironmentBuildState>,
  name: string,
  isDev: boolean
): EnvironmentBuildState {
  const current = states.get(name);
  if (current) {
    return current;
  }
  const state = createEnvironmentBuildState(isDev);
  states.set(name, state);
  return state;
}

/** build 默认 compact、dev 默认 readable，显式 core 配置优先。 */
export function resolveCoreOptions(core: TransformCssOptions, isDev: boolean): TransformCssOptions {
  return {
    ...core,
    className: {
      strategy: core.className?.strategy ?? (isDev ? 'readable' : 'compact'),
      prefix: core.className?.prefix
    }
  };
}

/** 配置保护：只允许已验证的 web/default-export/css-loader array 路线。 */
function validateEnvironment(config: NormalizedEnvironmentConfig, target: string): void {
  if (target !== 'web') {
    throw createUnsupportedFeatureError('rsbuild.target', String(target), '当前 adapter 只支持 web target。');
  }
  if (config.output.cssModules.namedExport) {
    throw createUnsupportedFeatureError(
      'rsbuild.output.cssModules.namedExport',
      'output.cssModules.namedExport',
      'named exports 尚不能与 default locals 同步增强，请关闭该配置。'
    );
  }
  const sourceMap = config.output.sourceMap;
  if (typeof sourceMap === 'object' && sourceMap !== null && sourceMap.css) {
    throw createUnsupportedFeatureError(
      'rsbuild.output.sourceMap.css',
      'output.sourceMap.css',
      '当前 adapter 不承诺转换后完整 CSS source map，请关闭 CSS source map。'
    );
  }
}

/** 检查最终 css-loader options 未切换到 string/stylesheet 或 named exports。 */
function validateCssLoaderUse(value: unknown, id: string): void {
  if (!value || typeof value !== 'object') {
    return;
  }
  const options = value as { exportType?: unknown; modules?: unknown };
  if (options.exportType !== undefined && options.exportType !== 'array') {
    throw createUnsupportedFeatureError(
      'css-loader.exportType',
      id,
      `仅支持默认 array export，实际为 ${String(options.exportType)}。`
    );
  }
  if (
    options.modules &&
    typeof options.modules === 'object' &&
    'namedExport' in options.modules &&
    options.modules.namedExport === true
  ) {
    throw createUnsupportedFeatureError(
      'css-loader.modules.namedExport',
      id,
      'named exports 尚不能与 default locals 同步增强。'
    );
  }
}

/** 当前生产实现锁定 Rsbuild 2.1.x 的已验证 loader/runtime 契约。 */
function validateRsbuildVersion(version: string): void {
  if (!/^2\.1\./.test(version)) {
    throw createUnsupportedFeatureError(
      'rsbuild.version',
      version,
      '当前 adapter 仅验证 Rsbuild 2.1.x；请使用受支持版本或等待新的契约验收。'
    );
  }
}

/** 校验文件名和 strict 保留边界。 */
function validatePublicOptions(options: ReturnType<typeof resolveOptions>): void {
  if (options.diagnostics.strict) {
    throw createUnsupportedFeatureError(
      'diagnostics.strict',
      'pluginSemanticAtomicCss.diagnostics.strict',
      'strict mode 尚未实现，请关闭该配置。'
    );
  }
  for (const filename of [options.cssFilename, options.manifest.filename, options.report.filename]) {
    if (path.posix.isAbsolute(filename) || filename.split('/').includes('..')) {
      throw new Error(`[semantic-atomic-css] invalid-asset-filename filename=${filename}`);
    }
  }
}

/** 按 Rsbuild HTML hook 提供的 assetPrefix 构造 link href。 */
function joinAssetPrefix(assetPrefix: string, filename: string): string {
  if (!assetPrefix) {
    return filename;
  }
  return `${assetPrefix.endsWith('/') ? assetPrefix : `${assetPrefix}/`}${filename.replace(/^\/+/, '')}`;
}

/** 统一 unsupported feature 错误格式。 */
function createUnsupportedFeatureError(feature: string, id: string, reason: string): Error {
  return new Error(`[semantic-atomic-css] unsupported-feature feature=${feature} id=${id} reason=${reason}`);
}
