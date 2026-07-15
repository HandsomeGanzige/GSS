import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suites = new Set(['base', 'preprocessor']);
const modes = new Set(['semantic', 'native']);

/**
 * 解析命令行参数并执行 fixture 的 Vite 操作。
 *
 * @returns {Promise<void>} 所有选定操作成功结束后解决。
 * @throws {Error} 当操作、suite、mode 非法，或 Vite 子进程执行失败时抛出。
 */
async function main() {
  const [action = 'dev', ...args] = process.argv.slice(2);
  const options = parseOptions(args);

  if (!['dev', 'build', 'preview'].includes(action)) {
    throw new Error(`不支持的 fixture 操作: ${action}`);
  }

  if (options.suite === 'all') {
    if (action !== 'build') {
      throw new Error('suite=all 只支持 build');
    }

    for (const suite of suites) {
      await runVite(action, suite, options.mode, options.passthrough);
    }
    return;
  }

  await runVite(action, options.suite, options.mode, options.passthrough);
}

/**
 * 解析 suite 与 CSS mode，并保留需要透传给 Vite CLI 的参数。
 *
 * @param {string[]} args - 不包含操作名的命令行参数。
 * @returns {{ suite: string, mode: string, passthrough: string[] }} 规范化后的 fixture 参数。
 * @throws {Error} 当 suite 或 mode 不在支持列表中时抛出。
 */
function parseOptions(args) {
  let suite = 'base';
  let mode = 'semantic';
  const passthrough = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--') {
      continue;
    }
    if (argument === '--suite') {
      suite = args[++index];
      continue;
    }
    if (argument === '--mode') {
      mode = args[++index];
      continue;
    }
    passthrough.push(argument);
  }

  if (suite !== 'all' && !suites.has(suite)) {
    throw new Error(`不支持的 fixture suite: ${suite}`);
  }
  if (!modes.has(mode)) {
    throw new Error(`不支持的 fixture CSS 模式: ${mode}`);
  }

  return { suite, mode, passthrough };
}

/**
 * 启动单个 suite/mode；build 与 preview 默认使用隔离产物目录。
 *
 * @param {string} action - Vite 操作，支持 dev、build 或 preview。
 * @param {string} suite - 要运行的 fixture suite。
 * @param {string} mode - CSS 输出模式。
 * @param {string[]} passthrough - 原样传递给 Vite CLI 的附加参数。
 * @returns {Promise<void>} 子进程以成功状态退出后解决。
 * @throws {Error} 当子进程无法启动、被信号终止或返回非零状态时抛出。
 */
async function runVite(action, suite, mode, passthrough) {
  const args = action === 'dev' ? [] : [action];
  const hasOutDir = passthrough.includes('--outDir');

  if (action !== 'dev' && !hasOutDir) {
    args.push('--outDir', path.join(fixtureRoot, 'dist', suite, mode));
  }
  if (action === 'build' && !passthrough.includes('--emptyOutDir')) {
    args.push('--emptyOutDir');
  }
  args.push(...passthrough);

  const code = await new Promise((resolve, reject) => {
    const child = spawn('vite', args, {
      cwd: fixtureRoot,
      env: {
        ...process.env,
        GSS_FIXTURE_SUITE: suite,
        GSS_FIXTURE_CSS_MODE: mode
      },
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', (exitCode, signal) => {
      if (signal) reject(new Error(`Vite 被信号 ${signal} 终止`));
      else resolve(exitCode ?? 1);
    });
  });

  if (code !== 0) {
    throw new Error(`Vite ${action} 失败: suite=${suite} mode=${mode} code=${code}`);
  }
}

await main();
