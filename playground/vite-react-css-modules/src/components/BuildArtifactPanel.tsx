import styles from './BuildArtifactPanel.module.less';

/** build 产物检查项，用于展示当前 Pilot 的产物验收重点。 */
export type ArtifactCheck = {
  label: string;
  value: string;
  status: 'pass' | 'watch';
};

/** build 产物面板输入。 */
type BuildArtifactPanelProps = {
  checks: ArtifactCheck[];
  selectedLabel?: string;
  onSelect?: (check: ArtifactCheck) => void;
};

/**
 * 渲染 build 输出检查面板，并将选中行为交给上层路由管理。
 *
 * @param props - 组件属性。
 * @param props.checks - 可选择的构建产物检查项。
 * @param props.selectedLabel - 当前选中项标签。
 * @param props.onSelect - 用户选择检查项时的回调。
 * @returns 可交互的构建产物检查面板。
 */
export function BuildArtifactPanel({ checks, selectedLabel, onSelect }: BuildArtifactPanelProps) {
  return (
    <section className={styles.artifactPanel} aria-label="Build artifact checks">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.sectionKicker}>Build output · {__GSS_CSS_MODE__} view</p>
          <h2 className={styles.sectionTitle}>Assets, preprocessors and emission policy</h2>
        </div>
        <button className={styles.downloadButton}>
          {__GSS_CSS_MODE__ === 'semantic' ? 'semantic-atomic.css' : 'native baseline'}
        </button>
      </div>

      <div className={styles.artifactList}>
        {checks.map((check) => (
          <div
            key={check.label}
            className={`${styles.artifactRow} ${selectedLabel === check.label ? styles.selectedArtifact : ''}`}
            data-status={check.status}
            data-pilot-case={`artifact-${check.label.toLowerCase().replaceAll(' ', '-')}`}
          >
            <span className={styles.checkLabel}>{check.label}</span>
            <code className={styles.checkValue}>{check.value}</code>
            <span className={styles.statusBadge}>{check.status}</span>
            <button className={styles.inspectButton} type="button" onClick={() => onSelect?.(check)}>
              Inspect
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
