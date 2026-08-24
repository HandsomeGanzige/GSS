/**
 * Rsbuild dev 的单一 atomic/preserved CSS owner。
 *
 * @remarks
 * 每个 CSS Module 只登记自己的转换结果；本模块按 source id 建立稳定全局快照，并在页面中维护唯一
 * `<style>`。这样后加载模块复用已有 atomic key 时不会再次输出同名规则并移动 cascade 位置。
 *
 * @module rsbuild/devStyles
 */
import {
  renderAtomicDeclarations,
  type RenderableAtomicDeclaration
} from './atomicCss.js';

/** 单个 compiled source 交给 dev shared owner 的最小样式快照。 */
export type DevStyleSource = {
  id: string;
  atomic: RenderableAtomicDeclaration[];
  preservedCss: string;
};

/** 一个 runtime bridge owner 注册到浏览器的当前样式快照。 */
export type DevStyleSnapshot = {
  sources: DevStyleSource[];
};

type DevStyleOwnerRecord = {
  sequence: number;
  snapshot: DevStyleSnapshot;
};

const styleOwnerAttribute = 'data-semantic-atomic-css-rsbuild-dev';
const owners = new Map<string, DevStyleOwnerRecord>();
let registrationSequence = 0;

/**
 * 登记一个 CSS Module owner，并返回只会清理本次登记的 dispose callback。
 *
 * @param ownerId - 顶层 CSS Module 的稳定绝对路径。
 * @param snapshot - 该 owner 的当前 `{ sources }` 转换快照。
 * @returns HMR dispose 时调用的清理函数。
 */
export function registerDevStyles(ownerId: string, snapshot: DevStyleSnapshot): () => void {
  const record = {
    sequence: registrationSequence++,
    snapshot
  };
  owners.set(ownerId, record);
  updateStyleElement();

  return () => {
    if (owners.get(ownerId) !== record) {
      return;
    }
    owners.delete(ownerId);
    updateStyleElement();
  };
}

/**
 * 按 source id 聚合并按 atomic key 去重，生成与 build owner 相同排序模型的 dev CSS。
 *
 * @param sources - 当前页面仍存活的 compiled source 快照。
 * @returns 单一 style owner 使用的完整 CSS。
 */
export function createDevCss(sources: Iterable<DevStyleSource>): string {
  const orderedSources = [...sources].sort((left, right) => compareText(left.id, right.id));
  const declarations = new Map<string, RenderableAtomicDeclaration>();
  const keyByClassName = new Map<string, string>();

  for (const source of orderedSources) {
    for (const declaration of source.atomic) {
      const existingKey = keyByClassName.get(declaration.className);
      if (existingKey && existingKey !== declaration.key) {
        throw new Error(
          `[semantic-atomic-css] dev-atomic-class-collision class=${declaration.className} source=${source.id}`
        );
      }
      keyByClassName.set(declaration.className, declaration.key);
      if (!declarations.has(declaration.key)) {
        declarations.set(declaration.key, declaration);
      }
    }
  }

  return joinCss([
    renderAtomicDeclarations([...declarations.values()]),
    ...orderedSources.map((source) => source.preservedCss)
  ]);
}

/** 从仍存活的 owners 选择每个 source 最新登记的快照。 */
function collectCurrentSources(): DevStyleSource[] {
  const sources = new Map<string, { sequence: number; source: DevStyleSource }>();

  for (const owner of owners.values()) {
    for (const source of owner.snapshot.sources) {
      const current = sources.get(source.id);
      if (!current || current.sequence <= owner.sequence) {
        sources.set(source.id, { sequence: owner.sequence, source });
      }
    }
  }

  return [...sources.values()].map(({ source }) => source);
}

/** 创建、更新或移除页面中唯一的 shared style owner。 */
function updateStyleElement(): void {
  if (typeof document === 'undefined') {
    return;
  }

  const css = createDevCss(collectCurrentSources());
  const selector = `style[${styleOwnerAttribute}]`;
  const current = document.querySelector<HTMLStyleElement>(selector);

  if (!css) {
    current?.remove();
    return;
  }

  const style = current ?? document.createElement('style');
  if (!current) {
    style.setAttribute(styleOwnerAttribute, '');
    document.head.append(style);
  }
  if (style.textContent !== css) {
    style.textContent = css;
  }
}

/** 拼接非空 CSS。 */
function joinCss(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join('\n\n');
}

/** Unicode code point 稳定文本比较。 */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
