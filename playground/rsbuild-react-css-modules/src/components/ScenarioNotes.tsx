import styles from './ScenarioNotes.module.css';

/** 场景说明数据，用于记录本 playground 的设计取舍。 */
export type ScenarioNote = {
  title: string;
  detail: string;
  tone: 'info' | 'success' | 'warning';
};

/** 场景说明面板输入。 */
type ScenarioNotesProps = {
  notes: ScenarioNote[];
};

/**
 * 渲染多路由 playground 的覆盖说明。
 *
 * @param props - 组件属性。
 * @param props.notes - 场景说明条目。
 * @returns 帮助人工验收理解覆盖边界的说明列表。
 */
export function ScenarioNotes({ notes }: ScenarioNotesProps) {
  return (
    <section className={styles.notesPanel} aria-label="Scenario notes">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.sectionKicker}>Scenario notes</p>
          <h2 className={styles.sectionTitle}>What this larger playground stresses</h2>
        </div>
      </div>

      <div className={styles.noteGrid}>
        {notes.map((note) => (
          <article key={note.title} className={styles.noteCard} data-tone={note.tone}>
            <h3 className={styles.noteTitle}>{note.title}</h3>
            <p className={styles.noteDetail}>{note.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
