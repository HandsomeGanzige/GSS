import attributeStyles from './cases/AttributeCase.module.css';
import cascadeStyles from './cases/CascadeCase.module.css';
import duplicateStyles from './cases/DuplicateCase.module.css';
import fallbackStyles from './cases/FallbackCase.module.css';
import interactionStyles from './cases/InteractionCase.module.css';

/**
 * 渲染精简验收用例页，集中覆盖 GSS adapter 的高风险语义点。
 *
 * @returns 包含 cascade、响应式、交互态与 fallback 场景的 React 元素。
 */
export function App() {
  return (
    <main className="acceptance-root" data-gss-root>
      <header className="acceptance-header">
        <p>Base visual acceptance</p>
        <h1>Vite CSS Modules semantic/native parity cases</h1>
      </header>

      <section className="case-section" aria-label="cascade and media cases">
        <h2>Cascade order</h2>
        <div
          className={`${cascadeStyles.stateBase} ${cascadeStyles.stateActive}`}
          data-gss-case="cascade-active"
        >
          active background must win over duplicated base background
        </div>
        <div className={cascadeStyles.responsiveStack} data-gss-case="responsive-stack">
          <span>responsive stack</span>
          <span>media override</span>
        </div>
        <div className={cascadeStyles.orderBox} data-gss-case="order-box">
          border shorthand followed by left color
        </div>
        <div className={cascadeStyles.importantBox} data-gss-case="important-box">
          important declaration must remain dominant
        </div>
        <div className={cascadeStyles.customToken} data-gss-case="custom-token">
          custom property provides var color
        </div>
        <div className={cascadeStyles.supportsGrid} data-gss-case="supports-grid">
          <span>supports column A</span>
          <span>supports column B</span>
        </div>
        <div className={cascadeStyles['dashed-token']} data-gss-case="dashed-token">
          dashed CSS Modules export key
        </div>
        <div className={cascadeStyles.camelToken} data-gss-case="camel-token">
          camelCase CSS Modules export key
        </div>
        <div className={cascadeStyles.selectorListTarget} data-gss-case="selector-list-cascade">
          later same-class declaration must win over the selector list
        </div>
        <div className={cascadeStyles.selectorListPeer} data-gss-case="selector-list-peer">
          selector-list peer shares the first atomic token
        </div>
        <button
          className={cascadeStyles.selectorListInteractive}
          data-gss-case="selector-list-interactive"
        >
          selector-list hover arm
        </button>
        <button
          className={cascadeStyles.selectorListInteractivePeer}
          data-gss-case="selector-list-interactive-peer"
        >
          selector-list focus arm
        </button>
        <div
          className={cascadeStyles.selectorListAttribute}
          data-gss-case="selector-list-attribute"
        >
          selector-list attribute mutation arm
        </div>
        <div
          className={cascadeStyles.selectorListAttributePeer}
          data-list-state="open"
          data-gss-case="selector-list-attribute-peer"
        >
          selector-list attribute-before-class arm
        </div>
        <div
          className={`${cascadeStyles.selectorListAttribute} ${cascadeStyles.selectorListAttributePeer}`}
          data-list-state="open"
          data-gss-case="selector-list-attribute-coincident"
        >
          one element matches both selector-list arms
        </div>
        <div
          className={cascadeStyles.selectorListIndependent}
          data-gss-case="selector-list-independent"
        >
          unrelated class must remain atomic
        </div>
      </section>

      <section className="case-section" aria-label="cascade oracle cases">
        <h2>Atomic and fallback cascade oracle</h2>
        <div
          className={`${cascadeStyles.oracleNonCompetingAtomic} ${cascadeStyles.oracleNonCompetingFallback}`}
          data-oracle="non-competing"
          data-gss-case="oracle-non-competing"
        >
          atomic color and fallback background both apply
        </div>
        <div
          className={`${cascadeStyles.oracleImportantAtomic} ${cascadeStyles.oracleImportantFallback}`}
          data-gss-case="oracle-important"
        >
          important atomic color wins over later normal fallback
        </div>
        <div
          className={`${cascadeStyles.oracleSpecificityFallback} ${cascadeStyles.oracleSpecificityAtomic}`}
          data-oracle="specificity"
          data-gss-case="oracle-specificity"
        >
          higher-specificity fallback wins over later atomic color
        </div>
        <div
          className={`${cascadeStyles.oracleStableOrderAtomic} ${cascadeStyles.oracleStableOrderFallback}`}
          data-gss-case="oracle-stable-order"
        >
          later equal-specificity fallback keeps its winner
        </div>
        <div
          className={`${cascadeStyles.oracleMediaAtomic} ${cascadeStyles.oracleMediaFallback}`}
          data-gss-case="oracle-media-overlap"
        >
          overlapping media conditions keep their original order
        </div>
        <div
          className={`${cascadeStyles.oracleSupportsAtomic} ${cascadeStyles.oracleSupportsFallback}`}
          data-gss-case="oracle-supports-overlap"
        >
          overlapping supports conditions keep their original order
        </div>
      </section>

      <section className="case-section" aria-label="later module duplicate cases">
        <h2>Duplicate declarations from another module</h2>
        <div className={duplicateStyles.duplicateBase} data-gss-case="duplicate-base">
          later module repeats the same base background
        </div>
        <div className={duplicateStyles.duplicateAlign} data-gss-case="duplicate-align">
          later module repeats the same align-items center declaration
        </div>
      </section>

      <section className="case-section" aria-label="attribute selector cases">
        <h2>Attribute selector guards</h2>
        <div className={attributeStyles.attributeState} data-gss-case="attribute-state">
          attribute state mutation target
        </div>
        <div
          className={attributeStyles.presenceGuard}
          data-present
          data-gss-case="attribute-presence"
        >
          presence guard atomic selector
        </div>
        <div
          className={attributeStyles.nodeOrder}
          data-placement="before"
          data-gss-case="attribute-node-order"
        >
          attribute-before-class node order
        </div>
        <button
          className={attributeStyles.orderRisk}
          data-state="ready"
          data-gss-case="attribute-order-risk"
        >
          attribute and hover order-risk fallback
        </button>
        <div
          className={attributeStyles.nearMiss}
          data-kind="danger-zone"
          data-gss-case="attribute-near-miss"
        >
          unsupported operator fallback
        </div>
      </section>

      <section className="case-section" aria-label="unsafe fallback cases">
        <h2>Preserved fallback selectors</h2>
        <div className={fallbackStyles.fallbackParent} data-gss-case="fallback-parent">
          <div className={fallbackStyles.fallbackChild} data-gss-case="fallback-child">
            descendant fallback box shadow
          </div>
        </div>
        <span
          className={`${fallbackStyles.compoundChip} ${fallbackStyles.primaryChip}`}
          data-gss-case="compound-chip"
        >
          compound fallback chip
        </span>
        <div className={fallbackStyles.attributeRow} data-tone="risk" data-gss-case="attribute-row-risk">
          <span>attribute fallback row</span>
          <strong className={fallbackStyles.stateBadge} data-gss-case="attribute-state-risk">
            risk
          </strong>
        </div>
        <div className={fallbackStyles.pseudoMarker} data-gss-case="pseudo-marker">
          pseudo-element marker
        </div>
        <div className={fallbackStyles.pseudoAfter} data-gss-case="pseudo-after">
          legacy after marker
        </div>
      </section>

      <section className="case-section" aria-label="interaction pseudo cases">
        <h2>Interaction states</h2>
        <button className={interactionStyles.hoverButton} data-gss-case="hover-button">
          hover target
        </button>
        <button className={interactionStyles.focusButton} data-gss-case="focus-button">
          focus visible target
        </button>
        <button className={interactionStyles.disabledButton} data-gss-case="disabled-button" disabled>
          disabled target
        </button>
      </section>
    </main>
  );
}
