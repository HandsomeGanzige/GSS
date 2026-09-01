import styles from './LazyProbe.module.css';

/** 渲染 inspector 入口的独立懒加载 CSS Module。 */
export function LazyProbe() {
  return (
    <div className={styles.lazyProbe} data-pilot-case="inspector-lazy-probe">
      lazy token: {styles.lazyProbe}
    </div>
  );
}
