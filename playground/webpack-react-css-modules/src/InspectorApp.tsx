import { lazy, Suspense, useEffect, useState } from 'react';
import aStyles from './inspector/ASourceOrder.module.css';
import icssStyles from './inspector/IcssProbe.module.css';
import zStyles from './inspector/ZSourceOrder.module.css';
import styles from './InspectorApp.module.css';

const LazyProbe = lazy(() => import('./inspector/LazyProbe').then((module) => ({ default: module.LazyProbe })));

const expectedSourceOrderColor = 'rgb(4, 120, 87)';

/**
 * 渲染 Webpack 专属契约检查页，集中暴露多入口、跨模块 cascade、ICSS value 和 lazy chunk 状态。
 *
 * @returns 可在 semantic/native 模式下直接人工对照的检查界面。
 */
export function InspectorApp() {
  const [sourceOrderColor, setSourceOrderColor] = useState('等待浏览器计算');
  const [showLazyProbe, setShowLazyProbe] = useState(false);
  const icssValueIsStable = !icssStyles.collisionLabel.includes(' ');
  const sourceOrderMatchesNative = sourceOrderColor === expectedSourceOrderColor;

  useEffect(() => {
    const probe = document.querySelector<HTMLElement>('[data-pilot-case="source-order-probe"]');
    if (probe) {
      setSourceOrderColor(getComputedStyle(probe).color);
    }
  }, []);

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>Webpack 5 · css-loader contract inspector</p>
          <h1 className={styles.title}>Semantic/native 边界检查页</h1>
          <p className={styles.description}>
            当前为 <strong>{__GSS_CSS_MODE__}</strong> 模式。该入口与主业务入口共享一次 compilation，
            用于观察全局 atomic asset、CSS chunk、tokens 与懒加载状态。
          </p>
        </div>
        <nav className={styles.actions} aria-label="Pilot pages">
          <a className={styles.link} href="/index.html">业务 Pilot</a>
          <a className={styles.link} href="/inspector.html">契约 Inspector</a>
        </nav>
      </header>

      <section className={styles.grid}>
        <article className={styles.card} data-status={sourceOrderMatchesNative ? 'pass' : 'risk'}>
          <p className={styles.cardLabel}>Cross-module cascade</p>
          <h2 className={styles.cardTitle}>反向文件名与 import 顺序</h2>
          <div
            className={`${zStyles.sourceOrder} ${aStyles.sourceOrder} ${styles.orderProbe}`}
            data-pilot-case="source-order-probe"
          >
            锁定版本的 native CSS 以 ASourceOrder → ZSourceOrder 排列，期望最终为绿色
          </div>
          <dl className={styles.details}>
            <div><dt>expected</dt><dd>{expectedSourceOrderColor}</dd></div>
            <div><dt>actual</dt><dd>{sourceOrderColor}</dd></div>
          </dl>
        </article>

        <article className={styles.card} data-status={icssValueIsStable ? 'pass' : 'risk'}>
          <p className={styles.cardLabel}>ICSS default export</p>
          <h2 className={styles.cardTitle}>class 与非 class value 同值</h2>
          <div className={icssStyles.collision} data-pilot-case="icss-collision-probe">
            semantic class token
          </div>
          <dl className={styles.details}>
            <div><dt>class</dt><dd>{icssStyles.collision}</dd></div>
            <div><dt>value</dt><dd>{icssStyles.collisionLabel}</dd></div>
          </dl>
        </article>

        <article className={styles.card} data-status="pass">
          <p className={styles.cardLabel}>Lazy module graph</p>
          <h2 className={styles.cardTitle}>独立 CSS chunk 与 token</h2>
          <button className={styles.primaryButton} type="button" onClick={() => setShowLazyProbe(true)}>
            加载 inspector lazy chunk
          </button>
          {showLazyProbe ? (
            <Suspense fallback={<p className={styles.pending}>正在加载 lazy module…</p>}>
              <LazyProbe />
            </Suspense>
          ) : null}
        </article>

        <article className={styles.card} data-status="pass">
          <p className={styles.cardLabel}>Multi-entry output</p>
          <h2 className={styles.cardTitle}>共享 semantic atomic asset</h2>
          <p className={styles.copy}>
            `index.html` 与 `inspector.html` 应各自保留原生 entry CSS，同时在 semantic build 中共同引用
            `static/css/semantic-atomic.css`。
          </p>
        </article>
      </section>
    </main>
  );
}
