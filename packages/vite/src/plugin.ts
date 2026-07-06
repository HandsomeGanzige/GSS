import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import {
  createTransformer,
  transformCss,
  type AtomicDeclaration,
  type Diagnostic,
  type TransformCssOptions,
  type TransformCssResult,
  type Transformer
} from '@semantic-atomic-css/core';
import { cleanRequestId, createCssModuleTokens, createCssModulesScopeStrategy, isCssModuleFile } from './cssModules.js';
import { resolveOptions } from './options.js';
import type { ResolvedSemanticAtomicCssOptions, SemanticAtomicCssOptions } from './types.js';

const virtualCssPrefix = 'virtual:semantic-atomic-css/css.css?source=';
const resolvedVirtualCssPrefix = '\0semantic-atomic-css/css.css?source=';
const resolvedModulePrefix = '\0semantic-atomic-css/module?source=';
const buildCssFileName = 'assets/semantic-atomic.css';

/** 创建 Vite adapter 插件。 */
export function semanticAtomicCss(options: SemanticAtomicCssOptions = {}): Plugin {
  const resolvedOptions = resolveOptions(options);
  const buildResults = new Map<string, TransformCssResult>();
  const devResults = new Map<string, TransformCssResult>();
  const buildOrder: string[] = [];
  const warnedDiagnostics = new Set<string>();
  let config: ResolvedConfig | undefined;
  let buildTransformer: Transformer | undefined;

  return {
    name: 'semantic-atomic-css:vite',
    enforce: 'pre',

    configResolved(resolvedConfig): void {
      config = resolvedConfig;
    },

    buildStart(): void {
      buildResults.clear();
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
        return loadDevVirtualCss(id, devResults);
      }

      if (!id.startsWith(resolvedModulePrefix)) {
        return null;
      }

      const file = decodeResolvedModuleSource(id);

      if (!config) {
        return null;
      }

      const css = await fs.readFile(file, 'utf8');
      const result = transformCssModule({
        id: file,
        css,
        config,
        options: resolvedOptions,
        buildTransformer,
        buildResults,
        devResults,
        buildOrder
      });
      emitDiagnostics(this, result.diagnostics, resolvedOptions, warnedDiagnostics);

      return {
        code: renderCssModuleJs(file, result, config.command, resolvedOptions),
        map: null
      };
    },

    handleHotUpdate(context): [] | void {
      const file = cleanRequestId(context.file);

      if (!config || !isCssModuleFile(file, config.root, resolvedOptions)) {
        return;
      }

      deleteTransformResult(devResults, file);
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
          source: JSON.stringify(buildTransformer.getReport(), null, 2)
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

/** 兼容早期命名的插件工厂别名。 */
export const semanticAtomicCssPlugin = semanticAtomicCss;

/** 删除指定文件的 transform 结果，并兼容 macOS /var 与 /private/var 路径别名。 */
function deleteTransformResult(results: Map<string, TransformCssResult>, file: string): void {
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
function transformCssModule(input: {
  id: string;
  css: string;
  config: ResolvedConfig;
  options: ResolvedSemanticAtomicCssOptions;
  buildTransformer: Transformer | undefined;
  buildResults: Map<string, TransformCssResult>;
  devResults: Map<string, TransformCssResult>;
  buildOrder: string[];
}): TransformCssResult {
  if (input.config.command === 'build') {
    const cached = input.buildResults.get(input.id);

    if (cached) {
      return cached;
    }
  }

  const scope = createCssModulesScopeStrategy({
    id: input.id,
    css: input.css,
    root: input.config.root,
    options: input.options
  });
  const coreInput = {
    id: input.id,
    css: input.css,
    scope
  };
  const result =
    input.config.command === 'build' && input.buildTransformer
      ? input.buildTransformer.transformCss(coreInput)
      : transformCss(coreInput, resolveCoreOptions(input.options, 'serve'));

  if (input.config.command === 'build') {
    input.buildResults.set(input.id, result);
    input.buildOrder.push(input.id);
  } else {
    input.devResults.set(input.id, result);
  }

  return result;
}

/** 渲染替代 CSS Modules 的 JS module。 */
function renderCssModuleJs(
  id: string,
  result: TransformCssResult,
  command: ResolvedConfig['command'],
  options: ResolvedSemanticAtomicCssOptions
): string {
  const tokens = createCssModuleTokens(result.classes, options.modules.localsConvention);
  const cssImport = command === 'serve' ? `import ${JSON.stringify(createVirtualCssId(id))};\n` : '';
  return `${cssImport}const tokens = ${JSON.stringify(tokens, null, 2)};\nexport default tokens;\n`;
}

/** 读取 dev virtual CSS 内容。 */
function loadDevVirtualCss(id: string, devResults: Map<string, TransformCssResult>): string {
  const source = decodeVirtualCssSource(id);
  const result = devResults.get(source);

  if (!result) {
    return '';
  }

  return createDevCss(devResults);
}

/** 创建 dev 阶段的全局 CSS 快照，避免不同模块重复 atomic class 后破坏 cascade 顺序。 */
function createDevCss(devResults: Map<string, TransformCssResult>): string {
  const atomic = createDevAtomicCss(devResults);
  const preservedCss = [...devResults.values()].map((result) => result.css.preserved);
  return joinCss([atomic, ...preservedCss]);
}

/** 聚合当前 dev 已知模块的 atomic declaration，并按 atomic key 去重。 */
function createDevAtomicCss(devResults: Map<string, TransformCssResult>): string {
  const declarations = new Map<string, AtomicDeclaration>();

  for (const result of devResults.values()) {
    for (const declaration of result.atomic) {
      if (!declarations.has(declaration.key)) {
        declarations.set(declaration.key, declaration);
      }
    }
  }

  return renderAtomicDeclarations([...declarations.values()]);
}

/** 渲染 adapter 内部聚合出来的 atomic declarations，保持 core 输出格式兼容。 */
function renderAtomicDeclarations(declarations: AtomicDeclaration[]): string {
  return declarations.map((declaration) => renderAtomicDeclaration(declaration)).join('\n\n');
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
  buildResults: Map<string, TransformCssResult>
): string {
  const preservedCss = buildOrder.map((id) => buildResults.get(id)?.css.preserved ?? '');
  return joinCss([transformer.getAtomicCss(), ...preservedCss]);
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
