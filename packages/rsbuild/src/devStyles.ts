/** Rsbuild browser runtime 兼容入口。 */
import {
  createDevCss,
  registerDevStyles as registerSharedDevStyles,
  type DevStyleSnapshot,
  type DevStyleSource
} from '@semantic-atomic-css/css-loader-bridge/dev-styles';
export { createDevCss };
export type { DevStyleSnapshot, DevStyleSource };
/** 保持既有两参数接口与 Rsbuild owner attribute。 */
export function registerDevStyles(ownerId: string, snapshot: DevStyleSnapshot): () => void {
  return registerSharedDevStyles('rsbuild', ownerId, snapshot);
}
