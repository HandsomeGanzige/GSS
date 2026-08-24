import styles from './Lazy.module.css';

const node = document.createElement('aside');
node.id = 'lazy';
node.className = styles.lazy;
node.textContent = styles.lazy;
globalThis.__GSS_FIXTURE_LAZY_TOKEN__ = styles.lazy;
document.querySelector('#root').append(node);
