import styles from './ActivityTable.module.css';

/** 活动行数据，用于覆盖表格式业务信息和 attribute fallback。 */
export type ActivityRow = {
  time: string;
  module: string;
  event: string;
  tone: 'success' | 'warning' | 'risk';
};

/** 活动表格输入。 */
type ActivityTableProps = {
  rows: ActivityRow[];
};

/** 渲染模块活动表格，用非 table 元素模拟密集业务列表。 */
export function ActivityTable({ rows }: ActivityTableProps) {
  return (
    <section className={styles.activityPanel} aria-label="Module activity">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.sectionKicker}>Build activity</p>
          <h2 className={styles.sectionTitle}>Module level observations</h2>
        </div>
        <span className={styles.liveBadge}>live preview</span>
      </div>

      <div className={styles.table}>
        <div className={styles.headerRow}>
          <span>Time</span>
          <span>Module</span>
          <span>Event</span>
          <span>State</span>
        </div>

        {rows.map((row) => (
          <div key={`${row.time}-${row.module}`} className={styles.row} data-tone={row.tone}>
            <span className={styles.time}>{row.time}</span>
            <span className={styles.moduleName}>{row.module}</span>
            <span className={styles.event}>{row.event}</span>
            <span className={styles.state}>{row.tone}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
