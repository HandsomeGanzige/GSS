/** css-loader adapters 共用的 Core options 环境归一化。 */
import type { TransformCssOptions } from '@semantic-atomic-css/core';

/**
 * 解析独立 css-loader registry 使用的 class name 策略。
 *
 * 未显式配置时，dev 使用 readable-keyed、build 使用 compact-keyed，保证逐模块 transform 只依赖 atomic key。
 * 用户显式选择的策略与 prefix 必须原样保留，adapter 不得静默改变公共 class 字节。
 */
export function resolveCssLoaderCoreOptions(
  core: TransformCssOptions,
  isDev: boolean
): TransformCssOptions {
  return {
    ...core,
    className: {
      strategy: core.className?.strategy ?? (isDev ? 'readable-keyed' : 'compact-keyed'),
      prefix: core.className?.prefix
    }
  };
}
