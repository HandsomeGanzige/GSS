import { spawn } from 'node:child_process';

/** 创建 visual 子进程 tracker；spawn 后立即登记，确保部分启动失败也可统一清理。 */
export function createVisualProcessTracker(root) {
  const children = new Set();

  /** 启动 Node 子进程并立即纳入 cleanup 集合。 */
  function startNode(args, env = {}) {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: 'pipe'
    });
    children.add(child);
    child.once('exit', () => children.delete(child));
    child.stderr.on('data', (data) => process.stderr.write(data));
    return child;
  }

  /** 终止所有仍在运行的已登记子进程。 */
  async function terminateAll() {
    await Promise.all([...children].map(terminateChild));
  }

  return { startNode, terminateAll };
}

/** 等待 WDS 输出动态 URL；超时和提前退出都清理 listener 并返回稳定错误。 */
export function waitForFixtureUrl(child, label, timeoutMs) {
  return new Promise((resolve, reject) => {
    let output = '';
    let settled = false;
    const failure = (reason) => new Error(`${label} dev readiness ${reason}\n${output}`);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off('exit', onExit);
      child.stdout.off('data', onData);
      error ? reject(error) : resolve(value);
    };
    const onExit = (code) => finish(failure(`exited (${String(code)})`));
    const onData = (data) => {
      output += String(data);
      const match = /GSS_FIXTURE_URL=(http:\/\/127\.0\.0\.1:\d+)/.exec(output);
      if (match) finish(undefined, match[1]);
    };
    const timer = setTimeout(() => finish(failure(`timed out after ${timeoutMs}ms`)), timeoutMs);
    child.once('exit', onExit);
    child.stdout.on('data', onData);
  });
}

/** SIGTERM 后有界等待，仍未退出时升级为 SIGKILL，并保证清理 Promise 最终结束。 */
export async function terminateChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    let settled = false;
    let killTimer;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(termTimer);
      clearTimeout(killTimer);
      child.off('exit', finish);
      resolve();
    };
    const termTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      killTimer = setTimeout(finish, 1_000);
    }, 5_000);
    child.once('exit', finish);
  });
}
