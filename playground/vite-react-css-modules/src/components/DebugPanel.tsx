import activityStyles from './ActivityTable.module.css';
import metricStyles from './MetricsGrid.module.css';
import pipelineStyles from './PipelineBoard.module.css';
import styles from './DebugPanel.module.css';

/** Debug token 展示项，帮助确认 CSS Modules default export 的 class 字符串。 */
export type DebugTokenGroup = {
  label: string;
  tokenKey: string;
  note: string;
};

/** Debug 面板输入。 */
type DebugPanelProps = {
  groups: DebugTokenGroup[];
  expandedKeys?: string[];
  onToggle?: (tokenKey: string) => void;
};

const tokenSources: Record<string, Record<string, string>> = {
  metricCard: metricStyles,
  taskCard: pipelineStyles,
  row: activityStyles
};

/** 渲染 tokens 输出面板，用于人工检查 semantic scoped class 与 atomic classes。 */
export function DebugPanel({ groups, expandedKeys = [], onToggle }: DebugPanelProps) {
  return (
    <section className={styles.debugPanel} aria-label="CSS Modules token debug">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.sectionKicker}>Token debug</p>
          <h2 className={styles.sectionTitle}>CSS Modules export strings</h2>
        </div>
      </div>

      <div className={styles.tokenList}>
        {groups.map((group) => {
          const token = tokenSources[group.tokenKey]?.[group.tokenKey] ?? 'missing-token';

          return (
            <article key={group.tokenKey} className={styles.tokenCard} data-pilot-case={`token-${group.tokenKey}`}>
              <div className={styles.tokenMeta}>
                <strong className={styles.tokenLabel}>{group.label}</strong>
                <span className={styles.tokenKey}>{group.tokenKey}</span>
                <button className={styles.tokenToggle} type="button" onClick={() => onToggle?.(group.tokenKey)}>
                  {expandedKeys.includes(group.tokenKey) ? 'Collapse' : 'Expand'}
                </button>
              </div>
              {expandedKeys.includes(group.tokenKey) ? (
                <>
                  <pre className={styles.tokenValue}>{token}</pre>
                  <p className={styles.tokenNote}>{group.note}</p>
                </>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
