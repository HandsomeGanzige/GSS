import styles from './RuleInspector.module.css';

/** 规则检查卡片数据，用于展示 safe 与 unsafe 期望。 */
export type RuleCard = {
  title: string;
  level: 'pass' | 'warning';
  summary: string;
};

/** 规则检查面板输入。 */
type RuleInspectorProps = {
  rules: RuleCard[];
};

/**
 * 渲染规则检查面板，帮助人工确认 playground 覆盖的选择器类别。
 *
 * @param props - 组件属性。
 * @param props.rules - 要展示的规则检查结果。
 * @returns 按诊断等级呈现的规则列表。
 */
export function RuleInspector({ rules }: RuleInspectorProps) {
  return (
    <section className={styles.inspector} aria-label="Rule inspector">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.sectionKicker}>Diagnostics</p>
          <h2 className={styles.sectionTitle}>Selector safety coverage</h2>
        </div>
      </div>

      <div className={styles.ruleGrid}>
        {rules.map((rule) => (
          <article key={rule.title} className={styles.ruleCard} data-level={rule.level}>
            <span className={styles.levelBadge}>{rule.level}</span>
            <h3 className={styles.ruleTitle}>{rule.title}</h3>
            <p className={styles.ruleSummary}>{rule.summary}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
