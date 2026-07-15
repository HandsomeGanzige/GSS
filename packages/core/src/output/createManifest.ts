/**
 * Atomic/class mapping 到机器可读 manifest 的投影模块。
 *
 * @module core/output/createManifest
 */
import type { AtomicDeclaration, TransformClassMapping, TransformManifest } from '../public/types.js';

/**
 * 创建当前输入或聚合 registry 的 manifest。
 *
 * @param id - class manifest key 使用的来源 id；只创建 atomic 部分时可以传空字符串。
 * @param atomic - 要写入 atomic 反查索引的 declarations。
 * @param classes - 当前输入的 source class mappings。
 * @returns 不共享输入数组或嵌套对象引用的 manifest。
 */
export function createManifest(
  id: string,
  atomic: AtomicDeclaration[],
  classes: Record<string, TransformClassMapping>
): TransformManifest {
  const atomicManifest: TransformManifest['atomic'] = {};
  const classManifest: TransformManifest['classes'] = {};

  for (const declaration of atomic) {
    atomicManifest[declaration.className] = {
      key: declaration.key,
      className: declaration.className,
      declaration: {
        ...declaration.declaration,
        source: declaration.declaration.source && { ...declaration.declaration.source }
      },
      context: { ...declaration.context },
      sources: declaration.sources.map((source) => ({ ...source }))
    };
  }

  for (const mapping of Object.values(classes)) {
    classManifest[`${id}::${mapping.sourceClassName}`] = {
      id,
      sourceClassName: mapping.sourceClassName,
      resolvedClassName: mapping.resolvedClassName,
      atomicClassNames: [...mapping.atomicClassNames],
      suggestedClassName: mapping.suggestedClassName,
      unsafeReasons: mapping.unsafeReasons ? [...mapping.unsafeReasons] : undefined
    };
  }

  return {
    atomic: atomicManifest,
    classes: classManifest
  };
}
