import type { ReactNode } from 'react';
import styles from './Shell.module.css';

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

/** 提供 playground 的页面框架、顶部状态栏和说明区域。 */
export function Shell<T extends string>({ routes, activeRoute, activeDescription, children }: ShellProps<T>) {
  return (
    <main className={styles.shell}>
      <header className={styles.topbar} data-density="compact">
        <div className={styles.brandCluster}>
          <span className={styles.logoMark}>GSS</span>
          <div className={styles.brandCopy}>
            <p className={styles.eyebrow}>Phase 3 Playground</p>
            <h1 className={styles.title}>Semantic Ops Console</h1>
          </div>
        </div>

        <div className={styles.statusCluster}>
          <span className={styles.statusPill}>Vite dev ready</span>
          <button className={styles.actionButton}>Inspect CSS</button>
          <button className={styles.actionButton} disabled>
            Manifest off
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
          <p className={styles.sectionLabel}>Larger CSS Modules scenario</p>
          <h2 className={styles.heroTitle}>验证多路由、多文件、多 fallback 的聚合输出</h2>
          <p className={styles.heroCopy}>
            这个页面把主要 UI 样式放入 `.module.css`，用于观察 dev virtual CSS 注入、build 全局 atomic CSS
            聚合，以及 unsafe selector preserved fallback 是否符合正确性优先原则。当前视图：{activeDescription}。
          </p>
        </div>
        <div className={styles.heroPanel}>
          <span className={styles.panelMetric}>4 hash routes</span>
          <span className={styles.panelMetric}>10+ modules</span>
          <span className={styles.panelMetric}>safe + fallback</span>
        </div>
      </section>

      <section className={styles.contentGrid}>{children}</section>
    </main>
  );
}
