import './styles.css';
import baseStyles from './Base.module.css';
import sassStyles from './Theme.module.scss';
import lessStyles from './Panel.module.less';

const tokens = { baseStyles, sassStyles, lessStyles };
globalThis.__GSS_FIXTURE_TOKENS__ = tokens;
document.querySelector('#root').innerHTML = `
  <main id="preprocessor-shell" class="${baseStyles.shell}">
    <section id="scss-asset" class="${sassStyles.hero}">SCSS asset</section>
    <section id="scss-safe" class="${sassStyles.safeScss}">SCSS safe</section>
    <section
      id="scss-attribute-ready"
      class="${sassStyles.compiledAttribute}"
      data-state="ready"
    >SCSS compiled attribute selector</section>
    <section id="less-safe" class="${lessStyles.panel}">Less safe <span id="less-child" class="${lessStyles.child}">child</span></section>
    <pre id="tokens">${JSON.stringify(tokens, null, 2)}</pre>
  </main>
`;
