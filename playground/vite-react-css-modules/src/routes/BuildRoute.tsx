import { BuildArtifactPanel } from '../components/BuildArtifactPanel';
import { DebugPanel } from '../components/DebugPanel';
import { artifactChecks, debugGroups } from '../data/opsData';

/** Build route 展示产物验收项和 CSS Modules tokens 输出。 */
export function BuildRoute() {
  return (
    <>
      <BuildArtifactPanel checks={artifactChecks} />
      <DebugPanel groups={debugGroups} />
    </>
  );
}
