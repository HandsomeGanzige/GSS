import styles from './ModuleMatrix.module.css';

/** 模块覆盖面数据，用于观察更多文件参与 CSS Modules 转换。 */
export type ModuleSurface = {
  name: string;
  files: string[];
  coverage: string;
  weight: 'large' | 'medium';
  state: 'active' | 'watch';
};

/** 模块矩阵输入。 */
type ModuleMatrixProps = {
  surfaces: ModuleSurface[];
  selectedName?: string;
  onSelect?: (surface: ModuleSurface) => void;
};

/**
 * 渲染路由和组件文件矩阵，并高亮当前选中模块。
 *
 * @param props - 组件属性。
 * @param props.surfaces - 要展示的模块覆盖面。
 * @param props.selectedName - 当前选中的模块名称。
 * @param props.onSelect - 用户选择模块时的回调。
 * @returns 可交互的模块覆盖矩阵。
 */
export function ModuleMatrix({ surfaces, selectedName, onSelect }: ModuleMatrixProps) {
  return (
    <section className={styles.matrixPanel} aria-label="Module matrix">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.sectionKicker}>Module map</p>
          <h2 className={styles.sectionTitle}>Routes, components and CSS Modules</h2>
        </div>
        <span className={styles.surfaceCount}>{surfaces.length} surfaces</span>
      </div>

      <div className={styles.surfaceGrid}>
        {surfaces.map((surface) => (
          <article
            key={surface.name}
            className={`${styles.surfaceCard} ${selectedName === surface.name ? styles.selectedSurface : ''}`}
            data-state={surface.state}
            data-pilot-case={`module-${surface.name.toLowerCase().replaceAll(' ', '-')}`}
          >
            <div className={styles.surfaceTopline}>
              <h3 className={styles.surfaceName}>{surface.name}</h3>
              <span className={styles.weightBadge}>{surface.weight}</span>
            </div>
            <ul className={styles.fileList}>
              {surface.files.map((file) => (
                <li key={file} className={styles.fileItem}>
                  {file}
                </li>
              ))}
            </ul>
            <p className={styles.coverage}>{surface.coverage}</p>
            <button className={styles.inspectButton} type="button" onClick={() => onSelect?.(surface)}>
              Inspect surface
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
