import type { TransformCssInput, TransformCssOptions, TransformCssResult } from '../public/types.js';
import { createTransformer } from './createTransformer.js';

/** 无状态 transform helper，适合单文件测试和简单调用场景。 */
export function transformCss(input: TransformCssInput, options: TransformCssOptions = {}): TransformCssResult {
  return createTransformer(options).transformCss(input);
}
