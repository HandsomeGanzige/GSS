import { useMemo, useState } from 'react';
import { ActivityTable } from '../components/ActivityTable';
import { MetricsGrid } from '../components/MetricsGrid';
import { PipelineBoard } from '../components/PipelineBoard';
import { activities, metrics, stages } from '../data/opsData';
import styles from './OverviewRoute.module.css';

/** Overview 支持的时间周期。 */
type MetricPeriod = '24h' | '7d' | '30d';

/** 活动列表支持的状态筛选。 */
type ActivityFilter = 'all' | 'success' | 'warning' | 'risk';

const periods: MetricPeriod[] = ['24h', '7d', '30d'];
const activityFilters: ActivityFilter[] = ['all', 'success', 'warning', 'risk'];

/** Overview route 展示整体业务仪表盘和主要 adapter 信号。 */
export function OverviewRoute() {
  const [period, setPeriod] = useState<MetricPeriod>('24h');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [selectedStage, setSelectedStage] = useState('Capture');
  const visibleActivities = useMemo(
    () => activities.filter((activity) => activityFilter === 'all' || activity.tone === activityFilter),
    [activityFilter]
  );
  const visibleMetrics = useMemo(
    () =>
      metrics.map((metric, index) =>
        index === 0
          ? {
              ...metric,
              value: period === '24h' ? '428' : period === '7d' ? '2.4k' : '9.8k',
              delta: period
            }
          : metric
      ),
    [period]
  );

  return (
    <div className={styles.route} data-pilot-case="overview-route">
      <section className={styles.controlBar} aria-label="Overview controls">
        <div>
          <p className={styles.controlLabel}>Metric window</p>
          <div className={styles.segmented}>
            {periods.map((item) => (
              <button
                key={item}
                className={period === item ? styles.periodActive : styles.periodIdle}
                type="button"
                aria-pressed={period === item}
                onClick={() => setPeriod(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <label className={styles.filterField}>
          <span>Activity state</span>
          <select
            className={styles.selectControl}
            value={activityFilter}
            onChange={(event) => setActivityFilter(event.target.value as ActivityFilter)}
          >
            {activityFilters.map((filter) => (
              <option key={filter} value={filter}>
                {filter}
              </option>
            ))}
          </select>
        </label>
      </section>

      <MetricsGrid metrics={visibleMetrics} />
      <PipelineBoard stages={stages} selectedStage={selectedStage} onSelectStage={setSelectedStage} />
      <ActivityTable rows={visibleActivities} />
    </div>
  );
}
