import styles from './MetricsGrid.module.css';

/** 指标卡片的数据结构，用于覆盖不同状态 class 组合。 */
export type MetricItem = {
  label: string;
  value: string;
  delta: string;
  tone: 'positive' | 'warning' | 'neutral';
  detail: string;
};

/** 指标区输入，集中渲染多个重复 declaration 以观察 atomic 去重。 */
type MetricsGridProps = {
  metrics: MetricItem[];
};

/**
 * 渲染 KPI 指标网格。
 *
 * @param props - 组件属性。
 * @param props.metrics - 按展示顺序排列的指标数据。
 * @returns 带趋势状态的指标卡片网格。
 */
export function MetricsGrid({ metrics }: MetricsGridProps) {
  return (
    <section className={styles.metricSection} aria-label="Semantic atomic metrics">
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>Runtime signals</p>
        <h2 className={styles.sectionTitle}>Adapter output overview</h2>
      </div>

      <div className={styles.metricGrid}>
        {metrics.map((metric) => (
          <article key={metric.label} className={`${styles.metricCard} ${styles[metric.tone]}`}>
            <div className={styles.metricTopline}>
              <span className={styles.metricLabel}>{metric.label}</span>
              <span className={styles.deltaBadge}>{metric.delta}</span>
            </div>
            <strong className={styles.metricValue}>{metric.value}</strong>
            <p className={styles.metricDetail}>{metric.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
