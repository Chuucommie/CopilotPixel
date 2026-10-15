import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

import {
  HOOK_API_PREFIX,
  SERVER_JSON_DIR,
  SERVER_JSON_NAME,
  SERVERS_DIR,
} from '../../../../constants.js';
import type { ServerTarget } from '../../../../serverConfig.js';
import { isServerConfig, isServerTarget } from '../../../../serverConfig.js';

const serverJson = path.join(os.homedir(), SERVER_JSON_DIR, SERVER_JSON_NAME);
const registryDirectory = path.join(os.homedir(), SERVER_JSON_DIR, SERVERS_DIR);

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readRegistry(): ServerTarget[] {
  let files: string[];
  try {
    files = fs.readdirSync(registryDirectory).filter((name) => name.endsWith('.json'));
  } catch {
    return [];
  }

  const servers: ServerTarget[] = [];
  for (const name of files) {
    try {
      const config = JSON.parse(
        fs.readFileSync(path.join(registryDirectory, name), 'utf8'),
      ) as unknown;
      if (isServerConfig(config) && isProcessAlive(config.pid)) servers.push(config);
    } catch {
      // Ignore malformed or concurrently removed registry entries.
    }
  }
  return servers;
}

function postEvent(server: ServerTarget, body: string): Promise<void> {
  return new Promise((resolve) => {
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port: server.port,
        path: `${HOOK_API_PREFIX}/copilot`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${server.token}`,
        },
        timeout: 2000,
      },
      (response) => {
        response.resume();
        resolve();
      },
    );
    request.on('error', resolve);
    request.on('timeout', () => {
      request.destroy();
      resolve();
    });
    request.end(body);
  });
}

async function main(): Promise<void> {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(input) as Record<string, unknown>;
  } catch {
    process.stdout.write('{}\n');
    return;
  }

  const servers = readRegistry();
  if (servers.length === 0) {
    try {
      const legacy = JSON.parse(fs.readFileSync(serverJson, 'utf8')) as unknown;
      if (isServerTarget(legacy)) servers.push(legacy);
    } catch {
      // The extension may not be running; hooks must never block Copilot CLI.
    }
  }

  const body = JSON.stringify(event);
  await Promise.all(servers.map((server) => postEvent(server, body)));
  process.stdout.write('{}\n');
}

void main().catch(() => process.stdout.write('{}\n'));
