import { RuleInspector } from '../components/RuleInspector';
import { SelectorMatrix } from '../components/SelectorMatrix';
import { rules, selectorCases } from '../data/opsData';

/** Diagnostics route 聚焦 selector safe/fallback 覆盖。 */
export function DiagnosticsRoute() {
  return (
    <>
      <SelectorMatrix cases={selectorCases} />
      <RuleInspector rules={rules} />
    </>
  );
}
