/** Webpack Pilot 的 CSS Modules 类型边界。 */
declare module '*.module.css' { const classes: Record<string, string>; export default classes; }
declare module '*.module.scss' { const classes: Record<string, string>; export default classes; }
declare module '*.module.less' { const classes: Record<string, string>; export default classes; }
/** 当前 Pilot 的 CSS 输出模式，由 DefinePlugin 在构建期注入。 */
declare const __GSS_CSS_MODE__: 'semantic' | 'native';
