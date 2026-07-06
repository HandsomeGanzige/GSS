import { ActivityTable } from '../components/ActivityTable';
import { MetricsGrid } from '../components/MetricsGrid';
import { PipelineBoard } from '../components/PipelineBoard';
import { activities, metrics, stages } from '../data/opsData';

/** Overview route 展示整体业务仪表盘和主要 adapter 信号。 */
export function OverviewRoute() {
  return (
    <>
      <MetricsGrid metrics={metrics} />
      <PipelineBoard stages={stages} />
      <ActivityTable rows={activities} />
    </>
  );
}
