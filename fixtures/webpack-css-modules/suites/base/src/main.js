import './styles.css';
import { cascadeStyles, styles } from './shell.js';
import attributeStyles from './AttributeCase.module.css';
import lateReuseStyles from './LateReuse.module.css';

globalThis.__GSS_FIXTURE_TOKENS__ = {
  ...styles,
  attributeStyles,
  lateReuse: lateReuseStyles.lateReuse
};
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
    <section id="selector-list-cascade" class="${styles.selectorListTarget}">selector-list cascade</section>
    <section id="selector-list-peer" class="${styles.selectorListPeer}">selector-list peer</section>
    <button id="selector-list-interactive" class="${styles.selectorListInteractive}">selector-list hover arm</button>
    <button id="selector-list-interactive-peer" class="${styles.selectorListInteractivePeer}">selector-list focus arm</button>
    <section id="selector-list-attribute" class="${styles.selectorListAttribute}">selector-list attribute mutation arm</section>
    <section
      id="selector-list-attribute-peer"
      class="${styles.selectorListAttributePeer}"
      data-list-state="open"
    >selector-list attribute-before-class arm</section>
    <section
      id="selector-list-attribute-coincident"
      class="${styles.selectorListAttribute} ${styles.selectorListAttributePeer}"
      data-list-state="open"
    >one element matches both selector-list arms</section>
    <section id="selector-list-independent" class="${styles.selectorListIndependent}">unrelated atomic class</section>
    <section id="pseudo-before" class="${styles.pseudoBefore}">modern before</section>
    <section id="pseudo-after" class="${styles.pseudoAfter}">legacy after</section>
    <section
      id="oracle-non-competing"
      class="${styles.oracleNonCompetingAtomic} ${styles.oracleNonCompetingFallback}"
      data-oracle="non-competing"
    >atomic color and fallback background</section>
    <section
      id="oracle-important"
      class="${styles.oracleImportantAtomic} ${styles.oracleImportantFallback}"
    >important atomic winner</section>
    <section
      id="oracle-specificity"
      class="${styles.oracleSpecificityFallback} ${styles.oracleSpecificityAtomic}"
      data-oracle="specificity"
    >higher-specificity fallback winner</section>
    <section
      id="oracle-stable-order"
      class="${styles.oracleStableOrderAtomic} ${styles.oracleStableOrderFallback}"
    >stable atomic then fallback order</section>
    <section
      id="oracle-media-overlap"
      class="${styles.oracleMediaAtomic} ${styles.oracleMediaFallback}"
    >overlapping media winner</section>
    <section
      id="oracle-supports-overlap"
      class="${styles.oracleSupportsAtomic} ${styles.oracleSupportsFallback}"
    >overlapping supports winner</section>
    <section id="attribute-state" class="${attributeStyles.attributeState}">
      attribute state mutation target
    </section>
    <section
      id="attribute-presence"
      class="${attributeStyles.presenceGuard}"
      data-present
    >presence guard atomic selector</section>
    <section
      id="attribute-node-order"
      class="${attributeStyles.nodeOrder}"
      data-placement="before"
    >attribute-before-class node order</section>
    <button
      id="attribute-order-risk"
      class="${attributeStyles.orderRisk}"
      data-state="ready"
    >attribute and hover order-risk fallback</button>
    <section
      id="attribute-near-miss"
      class="${attributeStyles.nearMiss}"
      data-kind="danger-zone"
    >unsupported operator fallback</section>
    <section
      id="late-reuse"
      class="${lateReuseStyles.lateReuse}"
      data-gss-case="duplicate-late-reuse"
    >late atomic reuse</section>
    <section id="unsafe-parent" class="${styles.unsafeParent}"><span id="unsafe-child">fallback</span></section>
    <pre id="tokens">${JSON.stringify(styles, null, 2)}</pre>
  </main>
`;

document.querySelector('#load-lazy').addEventListener('click', async () => {
  await import('./lazy.js');
});
