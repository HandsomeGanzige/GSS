/** Webpack 5 plugin composition root。 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import webpack, { type Compiler, type Compilation, type WebpackPluginInstance } from 'webpack';
import {
  createBuildArtifactSnapshot,
  createEnvironmentBuildState,
  recordRuntimeBridgeResult
} from '@semantic-atomic-css/css-loader-bridge';
import {
  createBrowserOverlayRuntime,
  createDevReportEnvelope,
  matchesDevReportRequest,
  type DevReportEnvelope,
  type ErrorDevReportEnvelope
} from '@semantic-atomic-css/devtools';
import { metadataPrefix, parseMetadata } from './metadata.js';
import { resolveCoreOptions, resolveOptions, unsupported } from './options.js';
import { installBridgeLoader, type PipelineMode, type SelectedLoaderRequest } from './ruleWalker.js';
import type { SemanticAtomicCssWebpackOptions } from './types.js';

const pluginName = 'semantic-atomic-css:webpack';
const adapterRequire = createRequire(import.meta.url);
const bridgePath = fileURLToPath(new URL('./runtimeBridgeLoader.js', import.meta.url));
const devRuntimePath = fileURLToPath(new URL('../../css-loader-bridge/dist/devStyles.js', import.meta.url));
type CompilerState = {
  mode: PipelineMode;
  latestReport: DevReportEnvelope;
  pendingReports: WeakMap<Compilation, DevReportEnvelope>;
};

/** Webpack 5 原生 css-loader CSS Modules adapter。 */
export class SemanticAtomicCssWebpackPlugin implements WebpackPluginInstance {
  readonly options: ReturnType<typeof resolveOptions>;
  constructor(options: SemanticAtomicCssWebpackOptions = {}) { this.options = resolveOptions(options); }

  apply(compiler: Compiler): void {
    validateCompiler(compiler);
    const implicitSourceMap = hasCssSourceMap(compiler.options.devtool);
    const install = installBridgeLoader(
      compiler.options.module?.rules as any[] ?? [],
      bridgePath,
      devRuntimePath,
      compiler.context,
      this.options,
      implicitSourceMap,
      typeof compiler.options.output.publicPath === 'string' ? compiler.options.output.publicPath : undefined
    );
    const mode = [...install.modes][0] ?? 'build';
    const state: CompilerState = {
      mode,
      latestReport: createDevReportEnvelope('webpack', []),
      pendingReports: new WeakMap()
    };
    validateSelectedLoaders(install.loaderRequests, compiler);

    const htmlPlugin = compiler.options.plugins.find((plugin: any) => plugin?.constructor?.name === 'HtmlWebpackPlugin') as any;
    const htmlInstalled = Boolean(htmlPlugin);
    const htmlNeeded = mode === 'build' || this.options.devtools.overlay;
    if (htmlNeeded && htmlInstalled) validatePeerVersion('html-webpack-plugin', 5);
    if (htmlNeeded && !htmlInstalled) throw unsupported('webpack.html-webpack-plugin', 'plugins', 'HTML build/overlay 需要 HtmlWebpackPlugin 5.x。');
    if (mode === 'dev' && this.options.devtools.enabled) validatePeerVersion('webpack-dev-server', 5);

    if (this.options.devtools.enabled) {
      this.installDevServerMiddleware(compiler, state);
      compiler.hooks.done.tap(pluginName, (stats) => {
        const pending = state.pendingReports.get(stats.compilation);
        state.pendingReports.delete(stats.compilation);
        if (stats.hasErrors()) {
          markDevReportError(state, 'webpack-compilation-failed');
          return;
        }
        state.latestReport = pending ?? createDevReportEnvelope('webpack', []);
      });
      compiler.hooks.failed.tap(pluginName, () => markDevReportError(state, 'webpack-compiler-failed'));
    }

    compiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
      const buildState = createEnvironmentBuildState(mode === 'dev');
      compilation.hooks.processAssets.tap({ name: pluginName, stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS }, () => {
        for (const asset of compilation.getAssets().filter((item) => item.name.startsWith(metadataPrefix))) {
          const source = asset.source.source();
          const metadata = parseMetadata(Buffer.isBuffer(source) ? source.toString('utf8') : String(source), asset.name);
          recordRuntimeBridgeResult(buildState, {
            resourcePath: metadata.owner,
            inputs: metadata.inputs,
            atomicClassByKey: metadata.atomicClassByKey
          });
          compilation.deleteAsset(asset.name);
        }
        const core = resolveCoreOptions(this.options.core, mode === 'dev');
        if (mode === 'dev') {
          const environments = buildState.inputs.size === 0
            ? []
            : [{ name: 'web', report: createBuildArtifactSnapshot(buildState, core).report }];
          state.pendingReports.set(compilation, createDevReportEnvelope('webpack', environments));
          return;
        }
        if (buildState.inputs.size === 0) return;
        const snapshot = createBuildArtifactSnapshot(buildState, core, {
          manifest: this.options.manifest.enabled,
          report: this.options.report.enabled
        });
        if (snapshot.atomicCss.trim()) emitUnique(compilation, this.options.cssFilename, snapshot.atomicCss);
        if (this.options.manifest.enabled && snapshot.manifest) emitUnique(compilation, this.options.manifest.filename, `${JSON.stringify(snapshot.manifest, null, 2)}\n`);
        if (this.options.report.enabled && snapshot.report) emitUnique(compilation, this.options.report.filename, `${JSON.stringify(snapshot.report, null, 2)}\n`);
      });
      if (htmlNeeded && htmlPlugin) this.installHtmlHooks(compilation, htmlPlugin.constructor, mode);
    });
  }

  /** 通过 HtmlWebpackPlugin 公开 hook 注入 atomic link 与可选 overlay。 */
  private installHtmlHooks(
    compilation: Compilation,
    htmlPluginConstructor: { getHooks(compilation: Compilation): any },
    mode: PipelineMode
  ): void {
    htmlPluginConstructor.getHooks(compilation).alterAssetTagGroups.tap(pluginName, (data: any) => {
      if (mode === 'build' && compilation.getAsset(this.options.cssFilename)) {
        const href = joinPublicPath(data.publicPath ?? compilation.outputOptions.publicPath, this.options.cssFilename);
        if (!data.headTags.some((tag: any) => tag.tagName === 'link' && tag.attributes?.href === href)) {
          const tag = { tagName: 'link', voidTag: true, meta: { plugin: pluginName }, attributes: { rel: 'stylesheet', href } };
          const first = data.headTags.findIndex((entry: any) => entry.tagName === 'link' && entry.attributes?.rel === 'stylesheet');
          if (first < 0) data.headTags.push(tag); else data.headTags.splice(first, 0, tag);
        }
      }
      if (mode === 'dev' && this.options.devtools.overlay && !data.headTags.some((tag: any) => tag.attributes?.['data-semantic-atomic-css-overlay-runtime'] !== undefined)) {
        data.headTags.push({
          tagName: 'script',
          voidTag: false,
          meta: { plugin: pluginName },
          attributes: { type: 'module', 'data-semantic-atomic-css-overlay-runtime': '' },
          innerHTML: createBrowserOverlayRuntime({
            endpoint: this.options.devtools.endpoint,
            pollIntervalMs: this.options.devtools.pollIntervalMs
          })
        });
      }
      return data;
    });
  }

  /** 组合而非覆盖用户 setupMiddlewares，只处理 GET report。 */
  private installDevServerMiddleware(compiler: Compiler, state: CompilerState): void {
    const devServer = (compiler.options as any).devServer ?? {};
    const user = devServer.setupMiddlewares;
    devServer.setupMiddlewares = (middlewares: any[], server: any) => {
      server.app?.use((request: any, response: any, next: (error?: unknown) => void) => {
        if (request.method !== 'GET' || !matchesDevReportRequest(request.url, this.options.devtools.endpoint)) {
          next();
          return;
        }
        try {
          response.status(200)
            .set('content-type', 'application/json; charset=utf-8')
            .set('cache-control', 'no-store')
            .send(`${JSON.stringify(state.latestReport, null, 2)}\n`);
        } catch (error) {
          next(error);
        }
      });
      return typeof user === 'function' ? user(middlewares, server) : middlewares;
    };
    (compiler.options as any).devServer = devServer;
  }
}

/** 保留当前 compiler 的最后成功 environments，并标记最近失败。 */
function markDevReportError(state: CompilerState, error: string): void {
  const environments = state.latestReport.status === 'idle' ? [] : state.latestReport.environments;
  const envelope: ErrorDevReportEnvelope = { adapter: 'webpack', status: 'error', error, environments: [...environments] };
  state.latestReport = envelope;
}

/** 校验 rule 真正选择的每一份 loader package，而不是 adapter 附近的另一份依赖。 */
function validateSelectedLoaders(requests: SelectedLoaderRequest[], compiler: Compiler): void {
  const seen = new Set<string>();
  for (const selected of requests) {
    const key = `${selected.packageName}\0${selected.request}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const expectedMajor = selected.packageName === 'css-loader' ? 7 : selected.packageName === 'style-loader' ? 4 : 2;
    const packageJson = resolveSelectedLoaderPackage(selected, compiler);
    if (packageJson.name !== selected.packageName) {
      throw unsupported(`webpack.peer.${selected.packageName}`, selected.request, `实际 loader package 为 ${packageJson.name ?? 'unknown'}。`);
    }
    if (typeof packageJson.version !== 'string' || !packageJson.version.startsWith(`${expectedMajor}.`)) {
      throw unsupported(`webpack.peer.${selected.packageName}`, String(packageJson.version), `当前只验证 ${selected.packageName} ${expectedMajor}.x。`);
    }
  }
}
function resolveSelectedLoaderPackage(selected: SelectedLoaderRequest, compiler: Compiler): Record<string, unknown> {
  const request = selected.request.split('?')[0]!;
  const resolveLoader = compiler.options.resolveLoader as Record<string, unknown>;
  const hasCustomResolver = (isNonEmpty(resolveLoader.alias) || isNonEmpty(resolveLoader.modules) || isNonEmpty(resolveLoader.plugins));
  if (!path.isAbsolute(request) && hasCustomResolver) {
    throw unsupported('webpack.resolve-loader', selected.request, '自定义 resolveLoader 可能改变实际 loader package，当前无法同步证明。');
  }
  let filename: string;
  try {
    filename = path.isAbsolute(request)
      ? request
      : createRequire(path.join(compiler.context, '__semantic_atomic_css_resolve__.cjs')).resolve(request);
  } catch {
    throw unsupported(`webpack.peer.${selected.packageName}`, selected.request, `无法从 compiler.context 解析实际 ${selected.packageName} loader。`);
  }
  let directory = path.dirname(filename);
  while (true) {
    const packageFilename = path.join(directory, 'package.json');
    if (existsSync(packageFilename)) {
      try {
        return JSON.parse(readFileSync(packageFilename, 'utf8')) as Record<string, unknown>;
      } catch {
        throw unsupported(`webpack.peer.${selected.packageName}`, selected.request, '实际 loader package.json 无法解析。');
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw unsupported(`webpack.peer.${selected.packageName}`, selected.request, `无法定位实际 ${selected.packageName} package.json。`);
}

function isNonEmpty(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return !!value && typeof value === 'object' && Object.keys(value).length > 0;
}

function validatePeerVersion(packageName: string, major: number): void {
  let version: string;
  try {
    const filename = adapterRequire.resolve(`${packageName}/package.json`);
    version = JSON.parse(readFileSync(filename, 'utf8')).version as string;
  } catch {
    throw unsupported(`webpack.peer.${packageName}`, packageName, `未找到要求的 ${packageName} ${major}.x。`);
  }
  if (!version.startsWith(`${major}.`)) throw unsupported(`webpack.peer.${packageName}`, version, `当前只验证 ${packageName} ${major}.x。`);
}

function validateCompiler(compiler: Compiler): void {
  const version = compiler.webpack?.version ?? webpack.version;
  const match = /^(\d+)\.(\d+)\./.exec(version);
  if (!match || Number(match[1]) !== 5 || Number(match[2]) < 32) throw unsupported('webpack.version', version, '当前 adapter 只支持 Webpack >=5.32 <6。');
  const target = compiler.options.target;
  if (target !== 'web') throw unsupported('webpack.target', String(target), '当前 adapter 只支持精确的 web target。');
  if (compiler.options.output.publicPath === 'auto') throw unsupported('webpack.output.publicPath', 'auto', '动态 publicPath 无法安全恢复 synthetic asset URL。');
  if (compiler.options.output.library) throw unsupported('webpack.output.library', 'output.library', 'library 构建不在当前 web application contract 内。');
  const entry = compiler.options.entry;
  if (typeof entry === 'function') throw unsupported('webpack.entry-function', 'entry', '函数型 entry 无法静态验证 per-entry library。');
  if (entry && typeof entry === 'object') {
    for (const [name, description] of Object.entries(entry)) {
      if (description && typeof description === 'object' && 'library' in description && description.library) {
        throw unsupported('webpack.entry.library', `entry.${name}.library`, 'per-entry library 构建不在当前 web application contract 内。');
      }
    }
  }
  if (compiler.options.plugins.some((plugin: any) => plugin?.constructor?.name === 'ModuleFederationPlugin')) throw unsupported('webpack.module-federation', 'plugins', 'Module Federation 不在当前 adapter contract 内。');
  if ((compiler.options.experiments as any)?.css) throw unsupported('webpack.builtin-css', 'experiments.css', '请使用标准 css-loader 管线。');
}
/** 判断 Webpack devtool 是否会为 CSS loader context 启用 source map。 */
function hasCssSourceMap(devtool: Compiler['options']['devtool']): boolean {
  if (typeof devtool === 'string') return devtool.includes('source-map');
  if (!Array.isArray(devtool)) return false;
  return devtool.some((item) =>
    (item.type === 'css' || item.type === 'all') &&
    typeof item.use === 'string' &&
    item.use.includes('source-map')
  );
}
function emitUnique(compilation: Compilation, filename: string, source: string): void {
  if (compilation.getAsset(filename)) throw new Error(`[semantic-atomic-css] asset-conflict filename=${filename}`);
  compilation.emitAsset(filename, new webpack.sources.RawSource(source));
}
function joinPublicPath(publicPath: unknown, filename: string): string {
  if (publicPath === 'auto') throw unsupported('webpack.output.publicPath', 'auto', 'HtmlWebpackPlugin atomic link 需要静态 publicPath。');
  const prefix = typeof publicPath === 'string' ? publicPath : '';
  if (!prefix) return filename;
  return `${prefix.endsWith('/') ? prefix : `${prefix}/`}${filename.replace(/^\/+/, '')}`;
}
