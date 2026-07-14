import { useMemo, useState } from 'react';
import { RuleInspector } from '../components/RuleInspector';
import { SelectorMatrix } from '../components/SelectorMatrix';
import { rules, selectorCases } from '../data/opsData';
import styles from './DiagnosticsRoute.module.css';

/** selector 模式筛选。 */
type SelectorModeFilter = 'all' | 'safe' | 'fallback';

/** 诊断等级筛选。 */
type RuleLevelFilter = 'all' | 'pass' | 'warning';

/** Diagnostics route 聚焦 selector safe/fallback 覆盖。 */
export function DiagnosticsRoute() {
  const [modeFilter, setModeFilter] = useState<SelectorModeFilter>('all');
  const [levelFilter, setLevelFilter] = useState<RuleLevelFilter>('all');
  const [acknowledged, setAcknowledged] = useState(false);
  const visibleCases = useMemo(
    () => selectorCases.filter((item) => modeFilter === 'all' || item.mode === modeFilter),
    [modeFilter]
  );
  const visibleRules = useMemo(
    () => rules.filter((rule) => levelFilter === 'all' || rule.level === levelFilter),
    [levelFilter]
  );

  return (
    <div className={styles.route} data-pilot-case="diagnostics-route">
      <section className={styles.filterBar} aria-label="Diagnostic filters">
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Selector mode</span>
          <select
            className={styles.selectControl}
            value={modeFilter}
            onChange={(event) => setModeFilter(event.target.value as SelectorModeFilter)}
          >
            <option value="all">all</option>
            <option value="safe">safe</option>
            <option value="fallback">fallback</option>
          </select>
        </label>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Rule level</span>
          <select
            className={styles.selectControl}
            value={levelFilter}
            onChange={(event) => setLevelFilter(event.target.value as RuleLevelFilter)}
          >
            <option value="all">all</option>
            <option value="pass">pass</option>
            <option value="warning">warning</option>
          </select>
        </label>
        <button
          className={acknowledged ? styles.acknowledgedAction : styles.pendingAction}
          type="button"
          onClick={() => setAcknowledged((current) => !current)}
        >
          {acknowledged ? 'Acknowledged' : 'Acknowledge warnings'}
        </button>
      </section>

      <div
        className={`${styles.diagnosticProbe} ${
          acknowledged ? styles.acknowledgedProbe : styles.warningProbe
        }`}
        data-level={acknowledged ? 'pass' : 'warning'}
        data-pilot-case="fallback-probe"
      >
        <code className={styles.diagnosticCode}>fallback-selector-health</code>
        <span>{acknowledged ? 'reviewed' : 'needs review'}</span>
      </div>

      <ul className={styles.acknowledgedList}>
        <li className={styles.acknowledgedItem}>Scoped descendant and child selectors remain observable.</li>
      </ul>
      <div className="pilot-global-probe">Global probe remains available through scoped fallback output.</div>

      <SelectorMatrix cases={visibleCases} />
      <RuleInspector rules={visibleRules} />
    </div>
  );
}
