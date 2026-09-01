import type { ReactNode } from 'react';
import styles from './Shell.module.scss';

/** Shell 顶部导航使用的 route 描述。 */
export type RouteLink<T extends string = string> = {
  id: T;
  label: string;
  description: string;
};

/** Shell 组件的输入，承载业务仪表盘主体内容。 */
type ShellProps<T extends string = string> = {
  routes: RouteLink<T>[];
  activeRoute: T;
  activeDescription: string;
  children: ReactNode;
};

/**
 * 提供 playground 的页面框架、导航、顶部状态栏和说明区域。
 *
 * @typeParam T - 路由 id 的字符串字面量类型。
 * @param props - 组件属性。
 * @param props.routes - 可导航的路由元数据。
 * @param props.activeRoute - 当前激活的路由 id。
 * @param props.activeDescription - 当前路由说明。
 * @param props.children - 当前路由渲染内容。
 * @returns 共享的 playground 页面框架。
 */
export function Shell<T extends string>({ routes, activeRoute, activeDescription, children }: ShellProps<T>) {
  return (
    <main className={styles.shell} data-pilot-case="app-shell">
      <header className={styles.topbar} data-density="compact">
        <div className={styles.brandCluster}>
          <span className={styles.logoMark} data-pilot-case="scss-resource-logo">
            GSS
          </span>
          <div className={styles.brandCopy}>
            <p className={styles.eyebrow}>Webpack 5 · Native css-loader Pipeline Pilot</p>
            <h1 className={styles.title}>Semantic Ops Console</h1>
          </div>
        </div>

        <div className={styles.statusCluster}>
          <span className={styles.statusPill} data-pilot-case="css-mode">
            {__GSS_CSS_MODE__} mode
          </span>
          <a className={styles.actionButton} href="#/build">
            Inspect build
          </a>
          <button className={styles.actionButton} disabled>
            Strict off
          </button>
        </div>
      </header>

      <nav className={styles.routeNav} aria-label="Playground routes">
        {routes.map((route) => (
          <a
            key={route.id}
            className={`${styles.navItem} ${route.id === activeRoute ? styles.activeNavItem : ''}`}
            href={`#/${route.id}`}
            aria-current={route.id === activeRoute ? 'page' : undefined}
          >
            <span className={styles.navLabel}>{route.label}</span>
            <span className={styles.navDescription}>{route.description}</span>
          </a>
        ))}
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.sectionLabel}>Production readiness workspace</p>
          <h2 className={styles.heroTitle}>从模块风险到构建产物的完整运营视图</h2>
          <p className={styles.heroCopy}>
            团队在同一个工作台中检查模块覆盖、诊断风险、构建产物与发布门禁。当前视图：{activeDescription}。
          </p>
        </div>
        <div className={styles.heroPanel}>
          <span className={styles.panelMetric}>5 lazy routes</span>
          <span className={styles.panelMetric}>CSS · SCSS · Less</span>
          <span className={styles.panelMetric}>assets preserved</span>
        </div>
      </section>

      <section className={styles.contentGrid}>{children}</section>
    </main>
  );
}
