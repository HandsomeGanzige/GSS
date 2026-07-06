import { ModuleMatrix } from '../components/ModuleMatrix';
import { ScenarioNotes } from '../components/ScenarioNotes';
import { moduleSurfaces, scenarioNotes } from '../data/opsData';

/** Modules route 展示更细的文件、组件和 CSS Modules 覆盖矩阵。 */
export function ModulesRoute() {
  return (
    <>
      <ModuleMatrix surfaces={moduleSurfaces} />
      <ScenarioNotes notes={scenarioNotes} />
    </>
  );
}
