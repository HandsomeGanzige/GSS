import { useMemo, useState } from 'react';
import { ModuleMatrix } from '../components/ModuleMatrix';
import type { ModuleSurface } from '../components/ModuleMatrix';
import { ScenarioNotes } from '../components/ScenarioNotes';
import { moduleSurfaces, scenarioNotes } from '../data/opsData';
import styles from './ModulesRoute.module.css';

/** Modules route 支持的状态筛选。 */
type SurfaceFilter = 'all' | ModuleSurface['state'];

/**
 * 展示文件、组件和 CSS Modules 覆盖矩阵。
 *
 * @returns 支持搜索、状态筛选与详情选择的 Modules 路由。
 */
export function ModulesRoute() {
  const [query, setQuery] = useState('');
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>('all');
  const [selectedSurface, setSelectedSurface] = useState<ModuleSurface | undefined>(moduleSurfaces[0]);
  const visibleSurfaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return moduleSurfaces.filter(
      (surface) =>
        (surfaceFilter === 'all' || surface.state === surfaceFilter) &&
        (normalizedQuery.length === 0 ||
          surface.name.toLowerCase().includes(normalizedQuery) ||
          surface.files.some((file) => file.toLowerCase().includes(normalizedQuery)))
    );
  }, [query, surfaceFilter]);

  return (
    <div className={styles.route} data-pilot-case="modules-route">
      <section className={styles.filterBar} aria-label="Module filters">
        <label className={styles.searchField}>
          <span>Search modules</span>
          <input
            className={styles.textControl}
            value={query}
            type="search"
            placeholder="Route or CSS file"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <label className={styles.selectField}>
          <span>Surface state</span>
          <select
            className={styles.selectControl}
            value={surfaceFilter}
            onChange={(event) => setSurfaceFilter(event.target.value as SurfaceFilter)}
          >
            <option value="all">all</option>
            <option value="active">active</option>
            <option value="watch">watch</option>
          </select>
        </label>

        <span className={styles.resultCount}>{visibleSurfaces.length} results</span>
      </section>

      {visibleSurfaces.length > 0 ? (
        <ModuleMatrix
          surfaces={visibleSurfaces}
          selectedName={selectedSurface?.name}
          onSelect={setSelectedSurface}
        />
      ) : (
        <div className={styles.emptyState} data-pilot-case="modules-empty">
          No module surfaces match the current filters.
        </div>
      )}

      {selectedSurface ? (
        <aside className={styles.detailDrawer} data-pilot-case="module-detail" aria-label="Selected module detail">
          <div className={styles.drawerHeader}>
            <div>
              <p className={styles.drawerKicker}>Selected surface</p>
              <h2 className={styles.drawerTitle}>{selectedSurface.name}</h2>
            </div>
            <button className={styles.closeButton} type="button" onClick={() => setSelectedSurface(undefined)}>
              Close
            </button>
          </div>
          <p className={styles.drawerCopy}>{selectedSurface.coverage}</p>
          <div className={styles.fileChips}>
            {selectedSurface.files.map((file) => (
              <code key={file} className={styles.fileChip}>
                {file}
              </code>
            ))}
          </div>
        </aside>
      ) : null}

      <ScenarioNotes notes={scenarioNotes} />
    </div>
  );
}
