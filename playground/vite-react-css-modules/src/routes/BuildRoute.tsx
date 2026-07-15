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
  const [expandedKeys, setExpandedKeys] = useState<string[]>(['logoMark', 'artifactPanel']);

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

      <section className={styles.preprocessorMatrix} data-pilot-case="preprocessor-matrix">
        <div className={styles.matrixHeader}>
          <div>
            <p className={styles.environmentLabel}>Native pipeline coverage</p>
            <h2 className={styles.matrixTitle}>CSS Modules language matrix</h2>
          </div>
          <span className={styles.modeBadge}>{__GSS_CSS_MODE__}</span>
        </div>
        <div className={styles.sourceGrid}>
          <article className={styles.sourceCard} data-pilot-case="source-css">
            <strong className={styles.sourceTitle}>CSS</strong>
            <span>ICSS、composes 与跨语言 atomic reuse</span>
          </article>
          <article className={styles.sourceCard} data-pilot-case="source-scss">
            <strong className={styles.sourceTitle}>SCSS</strong>
            <span>@use partial、additionalData 与本地资源</span>
          </article>
          <article className={styles.sourceCard} data-pilot-case="source-less">
            <strong className={styles.sourceTitle}>Less</strong>
            <span>@import partial、mixin 与嵌套 selector</span>
          </article>
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
