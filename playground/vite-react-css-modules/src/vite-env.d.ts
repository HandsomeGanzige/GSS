/// <reference types="vite/client" />

/** 当前 Pilot 的 CSS 输出模式，由 Vite 配置在构建期注入。 */
declare const __GSS_CSS_MODE__: 'semantic' | 'native';

declare module '*.module.css' {
  const styles: Record<string, string>;
  export default styles;
}
