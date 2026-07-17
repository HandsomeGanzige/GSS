import './styles.css';
import { cascadeStyles, styles } from './shell.js';
import lateReuseStyles from './LateReuse.module.css';

globalThis.__GSS_FIXTURE_TOKENS__ = { ...styles, lateReuse: lateReuseStyles.lateReuse };
document.querySelector('#root').innerHTML = `
  <main id="shell" class="${styles.shell}">
    <button id="asset-button" class="${styles.assetButton}">资源与 composes</button>
    <section id="public-asset" class="${styles.publicAsset}">publicDir asset</section>
    <button id="hover-button" class="${styles.hoverButton}">hover / focus</button>
    <button id="disabled-button" class="${styles.disabledButton}" disabled>disabled</button>
    <section id="cascade-box" class="${styles.cascadeBox}">cascade</section>
    <section id="dev-cascade" class="${cascadeStyles.base} ${cascadeStyles.active}">dev cascade owner</section>
    <section id="important-box" class="${styles.importantBox}">important</section>
    <section id="dashed-token" class="${styles.dashedToken}">locals convention</section>
    <section id="icss-collision" class="${styles.collision}">ICSS class/value collision</section>
    <section id="late-reuse" class="${lateReuseStyles.lateReuse}">late atomic reuse</section>
    <section id="unsafe-parent" class="${styles.unsafeParent}"><span id="unsafe-child">fallback</span></section>
    <pre id="tokens">${JSON.stringify(styles, null, 2)}</pre>
  </main>
`;

document.querySelector('#load-lazy').addEventListener('click', async () => {
  await import('./lazy.js');
});
