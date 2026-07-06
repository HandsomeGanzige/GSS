import selectorParser from 'postcss-selector-parser';

/** 收集 selector 中的 source/global class，:global 内 class 不交给 resolver。 */
export function collectClassNames(selector: string): { sourceClassNames: string[]; globalClassNames: string[] } {
  const sourceClassNames = new Set<string>();
  const globalClassNames = new Set<string>();
  const root = selectorParser().astSync(selector);

  root.walk((node) => {
    if (node.type !== 'class') {
      return;
    }

    if (isInsideGlobal(node)) {
      globalClassNames.add(node.value);
    } else {
      sourceClassNames.add(node.value);
    }
  });

  return {
    sourceClassNames: [...sourceClassNames],
    globalClassNames: [...globalClassNames]
  };
}

/** 判断 selector node 是否位于 :global(...) 内。 */
export function isInsideGlobal(node: selectorParser.Node): boolean {
  let current: { type?: string; value?: string; parent?: unknown } | undefined = node.parent as
    | { type?: string; value?: string; parent?: unknown }
    | undefined;

  while (current) {
    if (current.type === 'pseudo' && current.value === ':global') {
      return true;
    }

    current = current.parent as { type?: string; value?: string; parent?: unknown } | undefined;
  }

  return false;
}
