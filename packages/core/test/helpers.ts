import type { ScopeStrategy } from '../src/index.js';

/** 创建测试用 scope strategy，统一把 source class 改写为 s_ 前缀。 */
export function createTestScope(): ScopeStrategy {
  return {
    resolveClassName(className) {
      return `s_${className}`;
    }
  };
}
