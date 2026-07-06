import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const distDir = path.join(root, 'playground/vite-react-css-modules/dist');
const reportPath = path.join(distDir, 'semantic-atomic-report.json');
const manifestPath = path.join(distDir, 'semantic-atomic-manifest.json');
const assetsDir = path.join(distDir, 'assets');

const failures = [];

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

check(existsSync(reportPath), 'Missing semantic-atomic-report.json.');
check(existsSync(manifestPath), 'Missing semantic-atomic-manifest.json.');
check(existsSync(assetsDir), 'Missing built assets directory.');

const report = existsSync(reportPath) ? readJson(reportPath) : undefined;
const manifest = existsSync(manifestPath) ? readJson(manifestPath) : undefined;
const cssFiles = existsSync(assetsDir)
  ? readdirSync(assetsDir)
      .filter((file) => file.endsWith('.css'))
      .map((file) => path.join(assetsDir, file))
  : [];
const css = cssFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

if (report) {
  check(report.summary.files === 1, `Expected 1 CSS module file, got ${report.summary.files}.`);
  check(report.summary.localClasses >= 5, `Expected at least 5 local classes, got ${report.summary.localClasses}.`);
  check(
    report.summary.atomicDeclarations >= 1,
    `Expected atomic declarations, got ${report.summary.atomicDeclarations}.`,
  );
  check(report.summary.unsafeRules === 1, `Expected 1 unsafe rule, got ${report.summary.unsafeRules}.`);
  check(report.unsafe?.[0]?.selector === '.card .button', 'Expected .card .button to be reported as unsafe.');
}

if (manifest) {
  const classMappings = Object.values(manifest.classes ?? {});
  const buttonMapping = classMappings.find((entry) => entry.localName === 'button');

  check(Boolean(buttonMapping), 'Missing button mapping in manifest.');
  if (buttonMapping) {
    check(
      buttonMapping.finalClassName.includes(buttonMapping.scopedName),
      'Button final class name does not preserve semantic scoped class.',
    );
    check(
      buttonMapping.atomicClasses.length > 0,
      'Button final class name does not include atomic classes.',
    );
  }
}

check(cssFiles.length > 0, 'Missing built CSS asset.');
check(/\._[a-z0-9_-]+\{/.test(css), 'Built CSS does not contain atomic CSS rules.');
check(
  /\.button_card__[a-z0-9]+ \.button_button__[a-z0-9]+/.test(css),
  'Built CSS does not contain scoped preserved fallback for .card .button.',
);
check(css.includes(':hover'), 'Built CSS does not contain hover atomic rule.');

if (failures.length > 0) {
  console.error('Phase 1 verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Phase 1 verification passed.');
console.log(
  `Report: ${report.summary.files} file, ${report.summary.localClasses} local classes, ${report.summary.atomicDeclarations} atomic declarations, ${report.summary.unsafeRules} unsafe rule.`,
);
