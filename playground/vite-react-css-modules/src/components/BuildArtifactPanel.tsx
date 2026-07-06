import styles from './BuildArtifactPanel.module.css';

/** build 产物检查项，用于展示 Phase 3 验收重点。 */
export type ArtifactCheck = {
  label: string;
  value: string;
  status: 'pass' | 'watch';
};

/** build 产物面板输入。 */
type BuildArtifactPanelProps = {
  checks: ArtifactCheck[];
};

/** 渲染 build 输出检查面板。 */
export function BuildArtifactPanel({ checks }: BuildArtifactPanelProps) {
  return (
    <section className={styles.artifactPanel} aria-label="Build artifact checks">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.sectionKicker}>Build output</p>
          <h2 className={styles.sectionTitle}>Assets and default emission policy</h2>
        </div>
        <button className={styles.downloadButton}>semantic-atomic.css</button>
      </div>

      <div className={styles.artifactList}>
        {checks.map((check) => (
          <div key={check.label} className={styles.artifactRow} data-status={check.status}>
            <span className={styles.checkLabel}>{check.label}</span>
            <code className={styles.checkValue}>{check.value}</code>
            <span className={styles.statusBadge}>{check.status}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
