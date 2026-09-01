/**
 * GSS 的 computed style verifier、diff report、dev report 协议和 browser overlay。
 *
 * @packageDocumentation
 */
export {
  createDevReportEnvelope,
  isValidDevReportEndpoint,
  matchesDevReportRequest
} from './protocol.js';
export { createBrowserOverlayRuntime } from './overlay.js';
export {
  assertNoStyleDifferences,
  captureComputedStyles,
  createStyleDiffReport,
  mergeStyleDiffReports,
  verifyComputedStyles,
  writeAndAssertStyleDiffReport,
  writeStyleDiffReport
} from './verifier.js';
export type {
  DevReportEnvelope,
  DevReportEnvironment,
  ErrorDevReportEnvelope,
  IdleDevReportEnvelope,
  ReadyDevReportEnvelope
} from './protocol.js';
export type { BrowserOverlayRuntimeOptions } from './overlay.js';
export type {
  ComputedStyleAction,
  ComputedStyleCase,
  ComputedStyleDifference,
  ComputedStyleSnapshot,
  PlaywrightBrowserContextLike,
  PlaywrightBrowserLike,
  PlaywrightPageLike,
  StyleDiffReport,
  StyleDiffRun,
  VerifyComputedStylesOptions
} from './verifier.js';
