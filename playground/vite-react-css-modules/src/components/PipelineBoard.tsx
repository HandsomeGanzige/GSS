import styles from './PipelineBoard.module.css';

/** Pipeline 任务项，用于展示多状态卡片和按钮状态。 */
export type PipelineTask = {
  title: string;
  owner: string;
  meta: string;
  priority: 'high' | 'medium' | 'low';
};

/** Pipeline 阶段数据，用于构造多列业务面板。 */
export type PipelineStage = {
  title: string;
  count: number;
  health: 'stable' | 'warning';
  tasks: PipelineTask[];
};

/** Pipeline 面板输入。 */
type PipelineBoardProps = {
  stages: PipelineStage[];
  selectedStage?: string;
  onSelectStage?: (title: string) => void;
};

/** 渲染转换流水线看板，覆盖多列布局、hover 和 unsafe descendant fallback。 */
export function PipelineBoard({ stages, selectedStage, onSelectStage }: PipelineBoardProps) {
  return (
    <section className={styles.board} aria-label="Semantic transform pipeline">
      <div className={styles.boardHeader}>
        <div>
          <p className={styles.sectionKicker}>Transform pipeline</p>
          <h2 className={styles.sectionTitle}>From semantic modules to atomic asset</h2>
        </div>
        <button className={styles.secondaryButton}>Open report</button>
      </div>

      <div className={styles.stageGrid}>
        {stages.map((stage) => (
          <article
            key={stage.title}
            className={`${styles.stage} ${selectedStage === stage.title ? styles.selectedStage : ''}`}
            data-health={stage.health}
            data-pilot-case={`pipeline-${stage.title.toLowerCase()}`}
          >
            <div className={styles.stageHeader}>
              <h3 className={styles.stageTitle}>{stage.title}</h3>
              <div className={styles.stageActions}>
                <span className={styles.stageCount}>{stage.count}</span>
                <button
                  className={styles.stageSelect}
                  type="button"
                  aria-pressed={selectedStage === stage.title}
                  onClick={() => onSelectStage?.(stage.title)}
                >
                  {selectedStage === stage.title ? 'Selected' : 'Inspect'}
                </button>
              </div>
            </div>

            <div className={styles.taskList}>
              {stage.tasks.map((task) => (
                <div key={task.title} className={styles.taskCard} data-priority={task.priority}>
                  <div className={styles.taskTopline}>
                    <strong className={styles.taskTitle}>{task.title}</strong>
                    <span className={styles.priorityBadge}>{task.priority}</span>
                  </div>
                  <p className={styles.taskMeta}>{task.owner}</p>
                  <span className={styles.taskTag}>{task.meta}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
