import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const devUrl = 'http://127.0.0.1:5187';
const children = new Set();
let stopping = false;

function signalChild(child, signal) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') console.error(`无法结束本次启动的子进程：${error.message}`);
  }
}

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  const running = [...children];
  for (const child of running) signalChild(child, 'SIGTERM');
  await Promise.race([
    Promise.all(running.map(child => child.exitCode !== null || child.signalCode !== null
      ? Promise.resolve() : new Promise(resolve => child.once('exit', resolve)))),
    delay(2000),
  ]);
  for (const child of running) signalChild(child, 'SIGKILL');
  process.exit(code);
}

function start(command, args, env, pipeOutput = false) {
  const child = spawn(command, args, {
    cwd: root, env, detached: process.platform !== 'win32',
    stdio: pipeOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  children.add(child);
  child.once('error', error => {
    console.error(`启动失败：${error.message}`);
    void stop(1);
  });
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!stopping) void stop(code ?? (signal ? 1 : 0));
  });
  return child;
}

process.once('SIGINT', () => { void stop(0); });
process.once('SIGTERM', () => { void stop(0); });

try {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(5187, '127.0.0.1', () => probe.close(resolve));
  });
  const require = createRequire(import.meta.url);
  const electron = require(path.join(root, 'node_modules', 'electron'));
  const vite = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
  const env = { ...process.env, CODEX_STUDIO_DEV_URL: devUrl, NO_COLOR: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const server = start(vite, ['--host', '127.0.0.1', '--port', '5187', '--strictPort'], env, true);
  let readyOutput = '';
  server.stdout.on('data', chunk => {
    process.stdout.write(chunk);
    readyOutput = (readyOutput + chunk.toString()).slice(-4000);
  });
  server.stderr.on('data', chunk => process.stderr.write(chunk));
  let ready = false;
  for (let attempt = 0; attempt < 150 && !stopping; attempt += 1) {
    if (readyOutput.includes(devUrl)) {
      try {
        const response = await fetch(devUrl, { signal: AbortSignal.timeout(500) });
        if (response.ok) { ready = true; break; }
      } catch { /* Vite may print its address just before accepting requests. */ }
    }
    await delay(200);
  }
  if (!stopping) {
    if (!ready) throw new Error('等待开发页面就绪超时。');
    start(electron, [root], env);
  }
} catch (error) {
  console.error(error.code === 'EADDRINUSE'
    ? '127.0.0.1:5187 已被占用，请先处理占用；本脚本不会关闭其他进程。'
    : `无法启动 Codex Studio：${error.message}`);
  await stop(1);
}
