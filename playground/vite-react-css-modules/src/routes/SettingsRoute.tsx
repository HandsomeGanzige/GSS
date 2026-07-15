import { useState } from 'react';
import styles from './SettingsRoute.module.css';

/** Settings route 支持的界面密度。 */
type InterfaceDensity = 'comfortable' | 'compact';

/**
 * 渲染运行门禁设置，覆盖条件 class、表单校验和 disabled 状态。
 *
 * @returns 包含本地校验、密度切换与保存状态的 Settings 路由。
 */
export function SettingsRoute() {
  const [density, setDensity] = useState<InterfaceDensity>('comfortable');
  const [email, setEmail] = useState('');
  const [threshold, setThreshold] = useState('30');
  const [notifications, setNotifications] = useState(true);
  const [saved, setSaved] = useState(false);
  const emailValid = email.includes('@') && email.includes('.');
  const thresholdNumber = Number(threshold);
  const thresholdValid = Number.isFinite(thresholdNumber) && thresholdNumber >= 1 && thresholdNumber <= 99;
  const canSave = emailValid && thresholdValid;

  return (
    <div className={styles.route} data-pilot-case="settings-route">
      <section className={styles.settingsPanel}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.sectionKicker}>Workspace policy</p>
            <h2 className={styles.sectionTitle}>Production readiness gates</h2>
          </div>
          <span className={saved ? styles.savedStatus : styles.unsavedStatus}>{saved ? 'Saved' : 'Unsaved'}</span>
        </div>

        <div className={styles.settingGroup}>
          <span className={styles.fieldLabel}>Interface density</span>
          <div className={styles.densitySwitch} data-pilot-case="conditional-density">
            {(['comfortable', 'compact'] as InterfaceDensity[]).map((item) => (
              <button
                key={item}
                className={density === item ? styles.densityActive : styles.densityNormal}
                type="button"
                aria-pressed={density === item}
                onClick={() => {
                  setDensity(item);
                  setSaved(false);
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <form
          className={styles.settingsForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) {
              setSaved(true);
            }
          }}
        >
          <label className={styles.fieldFrame}>
            <span className={styles.fieldLabel}>Alert email</span>
            <input
              className={styles.textControl}
              value={email}
              type="email"
              placeholder="ops@example.com"
              aria-invalid={email.length > 0 && !emailValid}
              onChange={(event) => {
                setEmail(event.target.value);
                setSaved(false);
              }}
            />
            {email.length > 0 && !emailValid ? (
              <span className={styles.validationMessage}>Enter a complete email address.</span>
            ) : null}
          </label>

          <label className={styles.fieldFrame}>
            <span className={styles.fieldLabel}>Preserved CSS warning threshold</span>
            <input
              className={styles.textControl}
              value={threshold}
              type="number"
              min="1"
              max="99"
              aria-invalid={!thresholdValid}
              onChange={(event) => {
                setThreshold(event.target.value);
                setSaved(false);
              }}
            />
            {!thresholdValid ? <span className={styles.validationMessage}>Use a value from 1 to 99.</span> : null}
          </label>

          <label className={styles.checkboxRow}>
            <input
              checked={notifications}
              type="checkbox"
              onChange={(event) => {
                setNotifications(event.target.checked);
                setSaved(false);
              }}
            />
            <span>Send a notification when the pilot becomes risky.</span>
          </label>

          <div className={styles.formActions}>
            <span>{notifications ? 'Notifications enabled' : 'Notifications paused'}</span>
            <button className={styles.saveButton} type="submit" disabled={!canSave} data-pilot-case="settings-save">
              Save policy
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
