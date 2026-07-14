import { useState } from 'react';
import { BuildArtifactPanel } from '../components/BuildArtifactPanel';
import type { ArtifactCheck } from '../components/BuildArtifactPanel';
import { DebugPanel } from '../components/DebugPanel';
import { artifactChecks, debugGroups } from '../data/opsData';
import pilotTokens from '../styles/PilotTokens.module.css';
import styles from './BuildRoute.module.css';

/** Build route 支持的环境模式。 */
type BuildEnvironment = 'development' | 'production';

/** Build route 展示产物验收项和 CSS Modules tokens 输出。 */
export function BuildRoute() {
  const [environment, setEnvironment] = useState<BuildEnvironment>('production');
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactCheck | undefined>(artifactChecks[0]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>(['metricCard']);

  return (
    <div className={styles.route} data-pilot-case="build-route">
      <section className={styles.environmentBar} aria-label="Build environment">
        <div>
          <p className={styles.environmentLabel}>Output profile</p>
          <div className={styles.environmentSwitch}>
            {(['development', 'production'] as BuildEnvironment[]).map((item) => (
              <button
                key={item}
                className={environment === item ? styles.environmentActive : styles.environmentIdle}
                type="button"
                aria-pressed={environment === item}
                onClick={() => setEnvironment(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.icssProbe} data-pilot-case="icss-export">
          <span>ICSS exports</span>
          <code className={pilotTokens.tokenProbe}>
            {pilotTokens.accentName} · {pilotTokens.spacingUnit}
          </code>
        </div>
      </section>

      <BuildArtifactPanel
        checks={artifactChecks}
        selectedLabel={selectedArtifact?.label}
        onSelect={setSelectedArtifact}
      />

      {selectedArtifact ? (
        <div className={styles.artifactDetail} data-pilot-case="artifact-detail">
          <strong>{selectedArtifact.label}</strong>
          <code>{selectedArtifact.value}</code>
          <span>{environment} profile</span>
        </div>
      ) : null}

      <DebugPanel
        groups={debugGroups}
        expandedKeys={expandedKeys}
        onToggle={(tokenKey) =>
          setExpandedKeys((current) =>
            current.includes(tokenKey) ? current.filter((item) => item !== tokenKey) : [...current, tokenKey]
          )
        }
      />
    </div>
  );
}
