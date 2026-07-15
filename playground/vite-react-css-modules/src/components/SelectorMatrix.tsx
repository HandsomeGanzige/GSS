import styles from './SelectorMatrix.module.css';

/** selector 覆盖样例，用于展示 safe atomization 与 preserved fallback。 */
export type SelectorCase = {
  selector: string;
  mode: 'safe' | 'fallback';
  reason: string;
  output: string;
};

/** selector 矩阵输入。 */
type SelectorMatrixProps = {
  cases: SelectorCase[];
};

/**
 * 渲染 selector 安全性覆盖矩阵。
 *
 * @param props - 组件属性。
 * @param props.cases - safe 与 fallback selector 用例。
 * @returns 按处理模式标识的 selector 用例矩阵。
 */
export function SelectorMatrix({ cases }: SelectorMatrixProps) {
  return (
    <section className={styles.selectorPanel} aria-label="Selector coverage">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.sectionKicker}>Selector matrix</p>
          <h2 className={styles.sectionTitle}>Safe atomization vs preserved fallback</h2>
        </div>
      </div>

      <div className={styles.caseGrid}>
        {cases.map((item) => (
          <article key={item.selector} className={styles.caseCard} data-mode={item.mode}>
            <span className={styles.modeBadge}>{item.mode}</span>
            <code className={styles.selectorValue}>{item.selector}</code>
            <div className={styles.caseMeta}>
              <span>{item.reason}</span>
              <span>{item.output}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
