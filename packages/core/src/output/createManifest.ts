import type { AtomicDeclaration, TransformClassMapping, TransformManifest } from '../public/types.js';

/** 基于 atomic registry 和 class mappings 创建机器可读 manifest。 */
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
