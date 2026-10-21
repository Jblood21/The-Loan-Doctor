// Spin up the real server as a child process on a scratch data dir.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const SERVER_ENTRY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.js');

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });

export async function startServer(env = {}) {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecamp-test-'));
  const child = spawn('node', [SERVER_ENTRY], {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      SERVE_CLIENT: 'false',
      SEED_DEMO_USER: 'false',
      DATA_DIR: dir,
      PORT: String(port),
      JWT_SECRET: 'test-secret-test-secret-test-secret',
      ADMIN_EMAIL: 'admin@test.local',
      ADMIN_PASSWORD: 'admin-pass-123',
      PUBLIC_BASE_URL: 'https://app.test',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));

  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) throw new Error(`server did not start:\n${log}`);
  }

  const call = async (method, p, { token, body, raw, headers } = {}) => {
    const res = await fetch(`${base}/api${p}`, {
      method,
      headers: { ...(raw ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, json, text };
  };

  return {
    base,
    call,
    log: () => log,
    async register(email, extra = {}) {
      const r = await call('POST', '/auth/register', { body: { email, password: 'password1', name: email.split('@')[0], ...extra } });
      return { ...r, token: r.json?.token };
    },
    async login(email, password) {
      const r = await call('POST', '/auth/login', { body: { email, password } });
      return r.json?.token;
    },
    adminToken() {
      return this.login('admin@test.local', 'admin-pass-123');
    },
    async stop() {
      child.kill('SIGKILL');
      await new Promise((r) => child.on('exit', r));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
