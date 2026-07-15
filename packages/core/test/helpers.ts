import type { ScopeStrategy } from '../src/index.js';

/**
 * 创建测试用 scope strategy，统一把 source class 改写为 `s_` 前缀。
 *
 * @returns 不依赖构建工具、且 scoped class 输出可预测的策略。
 */
export function createTestScope(): ScopeStrategy {
  return {
    /**
     * 为测试输入生成稳定 scoped class。
     *
     * @param className - CSS 源 class 名称。
     * @returns 带有 `s_` 前缀的 scoped class。
     */
    resolveClassName(className) {
      return `s_${className}`;
    }
  };
}
