import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suites = new Set(['base', 'preprocessor']);
const modes = new Set(['semantic', 'native']);

/** 解析 fixture 参数并执行真实 Rsbuild CLI。 */
async function main() {
  const [action = 'dev', ...args] = process.argv.slice(2);
  const options = parseOptions(args);

  if (!['dev', 'build', 'preview'].includes(action)) {
    throw new Error(`不支持的 fixture 操作: ${action}`);
  }
  if (options.suite === 'all') {
    if (action !== 'build') throw new Error('suite=all 只支持 build');
    for (const suite of suites) await runRsbuild(action, suite, options.mode, options.passthrough);
    return;
  }
  await runRsbuild(action, options.suite, options.mode, options.passthrough);
}

/** 提取 suite/mode，其他参数保持原样传给 Rsbuild。 */
function parseOptions(args) {
  let suite = 'base';
  let mode = 'semantic';
  const passthrough = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') continue;
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

  if (suite !== 'all' && !suites.has(suite)) throw new Error(`不支持的 fixture suite: ${suite}`);
  if (!modes.has(mode)) throw new Error(`不支持的 fixture CSS 模式: ${mode}`);
  return { suite, mode, passthrough };
}

/** 启动单个 suite/mode，并保持环境变量与 CLI 生命周期一致。 */
async function runRsbuild(action, suite, mode, passthrough) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn('rsbuild', [action, ...passthrough], {
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
      if (signal) reject(new Error(`Rsbuild 被信号 ${signal} 终止`));
      else resolve(exitCode ?? 1);
    });
  });

  if (code !== 0) throw new Error(`Rsbuild ${action} 失败: suite=${suite} mode=${mode} code=${code}`);
}

await main();
