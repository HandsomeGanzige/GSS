import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suites = new Set(['base', 'preprocessor']);
const modes = new Set(['semantic', 'native']);

/** 为统一 fixture 提供简单、可验证的 Vite 命令入口。 */
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

/** 解析 suite/mode，其余参数原样传给 Vite CLI。 */
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

/** 启动单个 suite/mode，build/preview 使用隔离的默认产物目录。 */
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
