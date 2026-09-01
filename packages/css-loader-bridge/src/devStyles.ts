/** css-loader adapters 共用的浏览器单一 style owner。 */
import { renderAtomicDeclarations, type RenderableAtomicDeclaration } from './atomicCss.js';

export type DevStyleSource = { id: string; atomic: RenderableAtomicDeclaration[]; preservedCss: string };
export type DevStyleSnapshot = { sources: DevStyleSource[] };
type RecordEntry = { snapshot: DevStyleSnapshot };

const ownersByAdapter = new Map<string, Map<string, RecordEntry>>();

/**
 * 登记 adapter 的当前模块快照，并返回 generation-safe dispose。
 * adapter id 同时隔离 registry 与 DOM owner attribute，避免两个 harness 相互清理。
 */
export function registerDevStyles(adapter: 'rsbuild' | 'webpack', ownerId: string, snapshot: DevStyleSnapshot): () => void {
  const owners = ownersByAdapter.get(adapter) ?? new Map<string, RecordEntry>();
  ownersByAdapter.set(adapter, owners);
  const previous = owners.get(ownerId);
  const record = { snapshot };
  owners.set(ownerId, record);
  try {
    updateStyleElement(adapter, owners);
  } catch (error) {
    if (previous) owners.set(ownerId, previous);
    else owners.delete(ownerId);
    throw error;
  }
  return () => {
    if (owners.get(ownerId) !== record) return;
    owners.delete(ownerId);
    updateStyleElement(adapter, owners);
  };
}

/** 按 canonical source id 顺序聚合、atomic key 去重并检测 class collision。 */
export function createDevCss(sources: Iterable<DevStyleSource>): string {
  const ordered = [...sources].sort((a, b) => compareText(a.id, b.id));
  const declarations = new Map<string, RenderableAtomicDeclaration>();
  const keyByClass = new Map<string, string>();
  for (const source of ordered) {
    for (const declaration of source.atomic) {
      const existing = keyByClass.get(declaration.className);
      if (existing && existing !== declaration.key) {
        throw new Error(`[semantic-atomic-css] dev-atomic-class-collision class=${declaration.className} source=${source.id}`);
      }
      keyByClass.set(declaration.className, declaration.key);
      if (!declarations.has(declaration.key)) declarations.set(declaration.key, declaration);
    }
  }
  return joinCss([renderAtomicDeclarations([...declarations.values()]), ...ordered.map((source) => source.preservedCss)]);
}

/**
 * 按 canonical owner id 合并当前 source；不同 owner 的重复快照必须内容一致。
 *
 * dev runtime 没有 raw export/preserve evidence 可供重新 transform。发生差异时任意选择一个 owner
 * 都可能丢失 fallback，因此保守 fail fast，而不是让异步注册顺序决定最终 CSS。
 */
function collectCurrentSources(owners: Map<string, RecordEntry>): DevStyleSource[] {
  const sources = new Map<string, { ownerId: string; source: DevStyleSource; signature: string }>();
  const orderedOwners = [...owners.entries()].sort(([left], [right]) => compareText(left, right));
  for (const [ownerId, owner] of orderedOwners) {
    for (const source of owner.snapshot.sources) {
      const signature = JSON.stringify(source);
      const current = sources.get(source.id);
      if (!current) {
        sources.set(source.id, { ownerId, source, signature });
        continue;
      }
      if (current.signature !== signature) {
        const ownerIds = [current.ownerId, ownerId].sort(compareText);
        throw new Error(
          `[semantic-atomic-css] unstable-dev-source-snapshot source=${source.id} owners=${ownerIds.join(',')}`
        );
      }
    }
  }
  return [...sources.values()].map(({ source }) => source);
}

function updateStyleElement(adapter: string, owners: Map<string, RecordEntry>): void {
  if (typeof document === 'undefined') return;
  const attribute = `data-semantic-atomic-css-${adapter}-dev`;
  const css = createDevCss(collectCurrentSources(owners));
  const current = document.querySelector<HTMLStyleElement>(`style[${attribute}]`);
  if (!css) {
    current?.remove();
    return;
  }
  const style = current ?? document.createElement('style');
  if (!current) {
    style.setAttribute(attribute, '');
    document.head.append(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

function joinCss(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join('\n\n');
}
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
