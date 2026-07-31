import baseStyles from './cases/Base.module.css';
import scssStyles from './cases/Theme.module.scss';
import lessStyles from './cases/Panel.module.less';

/**
 * 渲染稳定的预处理器、资源与 partial 回归场景。
 *
 * @returns 包含 SCSS、Less、资源引用与 partial 依赖场景的 React 元素。
 */
export function App() {
  return (
    <main className={baseStyles.shell}>
      <h1>Vite CSS Modules preprocessors</h1>
      <section
        className={scssStyles.assetComposed}
        data-gss-case="scss-asset"
        data-state="ready"
      >
        SCSS asset fallback
      </section>
      <button className={scssStyles.safeScss} data-gss-case="scss-safe">
        SCSS safe atomic
      </button>
      <section
        className={scssStyles.compiledAttribute}
        data-state="ready"
        data-gss-case="scss-attribute-ready"
      >
        SCSS compiled attribute selector
      </section>
      <section className={lessStyles.panel} data-gss-case="less-safe">
        <span className={lessStyles.child} data-gss-case="less-child">
          Less fallback child
        </span>
      </section>
    </main>
  );
}
