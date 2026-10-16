import { spawn } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { CliArgsError, parseArgs } from '../src/cli.js';
import { COPILOT_HOOK_EVENTS } from '../src/providers/hook/copilot/constants.js';

const CLI_BUNDLE = path.join(__dirname, '../../dist/cli.js');
const CLI_START_TIMEOUT_MS = 10_000;

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to allocate a test port'));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

async function waitForCondition(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + CLI_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for bundled CLI startup');
}

async function stopChild(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((resolve) => child.once('close', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

/** Run the real bundled CLI as a subprocess, returns exit code + output. */
function runCli(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI_BUNDLE, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('parseArgs', () => {
  // 1. No --port -> ephemeral default (unset), never a hardcoded port
  it('defaults port to undefined (ephemeral) when --port is omitted', () => {
    const args = parseArgs([]);
    expect(args.port).toBeUndefined();
    expect(args.host).toBe('127.0.0.1');
  });

  // 2. Valid --port is accepted
  it('accepts a valid --port', () => {
    expect(parseArgs(['--port', '3100']).port).toBe(3100);
    expect(parseArgs(['-p', '8080']).port).toBe(8080);
  });

  // 3. Boundary values are accepted
  it('accepts the boundary ports 1 and 65535', () => {
    expect(parseArgs(['--port', '1']).port).toBe(1);
    expect(parseArgs(['--port', '65535']).port).toBe(65535);
  });

  // 4. Non-numeric --port is rejected (would otherwise become NaN)
  it('rejects a non-numeric --port instead of producing NaN', () => {
    expect(() => parseArgs(['--port', 'not-a-number'])).toThrow(CliArgsError);
  });

  // 5. Zero is rejected (0 means "ephemeral" internally; not a valid explicit choice)
  it('rejects --port 0', () => {
    expect(() => parseArgs(['--port', '0'])).toThrow(CliArgsError);
  });

  // 6. Out-of-range (too high) is rejected
  it('rejects --port 70000 (out of TCP range)', () => {
    expect(() => parseArgs(['--port', '70000'])).toThrow(CliArgsError);
  });

  // 7. Negative is rejected
  it('rejects a negative --port', () => {
    expect(() => parseArgs(['--port', '-1'])).toThrow(CliArgsError);
  });

  // 8. Non-integer (decimal) is rejected
  it('rejects a decimal --port', () => {
    expect(() => parseArgs(['--port', '3100.5'])).toThrow(CliArgsError);
  });

  // 9. A port option without its required operand is rejected, not ignored
  it.each(['--port', '-p'])('rejects %s when its value is missing', (option) => {
    expect(() => parseArgs([option])).toThrow(CliArgsError);
    expect(() => parseArgs([option])).toThrow(/Missing value/);
  });

  // 10. --host is parsed independently of --port
  it('parses --host', () => {
    expect(parseArgs(['--host', '0.0.0.0']).host).toBe('0.0.0.0');
  });
});

// The TTY consent prompt is gone: first-run consent is asked in the app, as
// one step of the Intro (the server's hooksConsentRequest → the webview's
// IntroBubble, whose consent step renders it verbatim). Its two pinned
// semantics moved with it: "junk must never be read as approval" now lives in
// consentFlow.test.ts (an unrecognized hooksConsentResponse choice
// writes nothing), and the disclosure-content pins live in consentCopy.test.ts
// plus the handshake test asserting the request carries that copy verbatim.

/**
 * These spawn the real bundled dist/cli.js (built by esbuild), not the TS
 * source -- unlike the parseArgs tests above (which only prove importing the
 * module for its exports is side-effect-free), these prove the
 * `require.main === module` guard added to cli.ts still lets `main()` run
 * when the file IS executed directly, i.e. production behavior is intact.
 * Requires `npm run compile` (or `node esbuild.js`) to have produced
 * dist/cli.js first; reported as a loud skip if it hasn't.
 */
describe('dist/cli.js entry-point guard', () => {
  /** These tests spawn the BUNDLED CLI, so they need `npm run compile` to have
   *  run. Reported as a loud skip rather than an early `return`, which Vitest
   *  shows as PASSED with no message — a false green over a test that never
   *  exercised anything. */
  const itBuilt = it.skipIf(!fs.existsSync(CLI_BUNDLE));

  // 11. Direct execution still runs main() (--help exits 0 with usage)
  itBuilt('runs main() when executed directly: --help prints usage and exits 0', async () => {
    const { code, stdout } = await runCli(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('Usage: copilot-agents');
  });

  // 12. Direct execution still runs main()'s port validation (rejects before listen())
  itBuilt(
    'runs main() when executed directly: invalid --port exits 1 without starting a server',
    async () => {
      const { code, stderr } = await runCli(['--port', 'not-a-number']);
      expect(code).toBe(1);
      expect(stderr).toContain('Invalid --port');
    },
  );

  /** Spawn the real bundled CLI against an isolated HOME, wait for /api/health,
   *  and hand back its output for assertions. Callers seed `tmpHome` first.
   *  `host` is the literal `--host` operand, so a caller can exercise a wildcard
   *  bind; readiness is always probed over loopback, which every bind serves. */
  async function runCliServer(
    tmpHome: string,
    body: (ctx: { output: () => string; port: number }) => Promise<void>,
    host = '127.0.0.1',
  ): Promise<void> {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-cli-workspace-'));
    const port = await getFreePort();
    const child = spawn(process.execPath, [CLI_BUNDLE, '--port', port.toString(), '--host', host], {
      cwd: workspaceDir,
      env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    try {
      await waitForCondition(async () => {
        if (child.exitCode !== null) {
          throw new Error(`Bundled CLI exited before startup:\n${output}`);
        }
        try {
          return (await fetch(`http://127.0.0.1:${port.toString()}/api/health`)).ok;
        } catch {
          return false;
        }
      });
      await body({ output: () => output, port });
    } finally {
      await stopChild(child);
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  }

  /** The one line a standalone operator ever sees. Kept as a real regex over
   *  the real stdout, because a helper that reassembled the URL from parts
   *  would be testing the helper. The trailing `\s` makes it wait for a
   *  complete line: stdout arrives in chunks, and a half-delivered URL still
   *  parses as a URL (`http://127.0.0.1:501`). */
  const URL_LINE = /CopilotAgents server running at (\S+)\s/;

  function printedUrl(output: string): URL {
    const match = URL_LINE.exec(output);
    if (!match?.[1]) throw new Error(`No server URL in CLI output:\n${output}`);
    return new URL(match[1]);
  }

  /** The token the server actually minted, read from its own discovery file —
   *  an independent witness, so a printed token that drifts from it fails. */
  function mintedToken(tmpHome: string): string {
    const raw = fs.readFileSync(path.join(tmpHome, '.copilot-agents', 'server.json'), 'utf-8');
    return (JSON.parse(raw) as { token: string }).token;
  }

  // The printed URL is the ONLY channel by which a real browser obtains the
  // token, and the token is the whole privilege gate (httpServer.ts
  // standaloneTokenValid). A bare URL, or one carrying the wrong token, ships a
  // silently read-only session: the office renders, and the hooks toggle is
  // refused with no way for the operator to find out why. Nothing else in this
  // repo reads the CLI's stdout, so nothing else can catch that.
  itBuilt('prints a URL carrying the token the server actually minted', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-cli-url-'));
    await runCliServer(tmpHome, async ({ output, port }) => {
      await waitForCondition(() => URL_LINE.test(output()));
      const url = printedUrl(output());

      expect(url.searchParams.get('token')).toBe(mintedToken(tmpHome));
      expect(url.port).toBe(port.toString());
      // And it is browsable as printed — the SPA, not a 404 or a dead host.
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('<div id="root">');
    });
  });

  // `--host 0.0.0.0` is a BIND target, not an address to browse to: printing
  // `http://0.0.0.0:PORT` hands the operator a URL that is dead on Windows and
  // merely accidental elsewhere (macOS happens to route it to loopback, so
  // "does it load" alone would not catch this — hence the explicit check that
  // the DISPLAYED host is a loopback address). `::` and `''` take the same
  // branch and are left untested here: binding them needs IPv6 on the runner,
  // which is not a property of ours to depend on.
  itBuilt('prints a reachable loopback host when bound to the 0.0.0.0 wildcard', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-cli-wildcard-'));
    await runCliServer(
      tmpHome,
      async ({ output }) => {
        await waitForCondition(() => URL_LINE.test(output()));
        const url = printedUrl(output());

        expect(url.hostname).not.toBe('0.0.0.0');
        expect(['127.0.0.1', 'localhost', '[::1]', '::1']).toContain(url.hostname);
        // The wildcard bind must not cost the operator the token either.
        expect(url.searchParams.get('token')).toBe(mintedToken(tmpHome));
        expect((await fetch(url)).status).toBe(200);
      },
      '0.0.0.0',
    );
  });

  // Without consent the CLI must start normally and touch nothing — the ask
  // happens in the browser UI, never at startup. This is the inverse of the
  // seeded test below: it pins that the gate actually gates, rather than the
  // install happening to work.
  itBuilt('starts without touching settings.json when consent has not been given', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-cli-noconsent-'));
    await runCliServer(tmpHome, async ({ output }) => {
      // Give the startup consent/install path time to have run (it is awaited
      // before the "server running" line, which health readiness follows).
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(fs.existsSync(path.join(tmpHome, '.copilot', 'hooks', 'copilotagents.json'))).toBe(
        false,
      );
      expect(output()).toContain('needs one-time approval');
    });
  });

  // A pre-consent Copilot hook config is already active, so startup migrates it
  // silently and preserves unrelated config and third-party hook entries.
  itBuilt(
    'grants an existing Copilot hook install without changing neighboring hooks',
    async () => {
      const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cplt-cli-'));
      const configPath = path.join(tmpHome, '.copilot', 'hooks', 'copilotagents.json');
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      const hookPath = path.join(tmpHome, '.copilot-agents', 'hooks', 'copilot-hook.js');
      const ourEntry = { type: 'command', exec: 'node', args: [hookPath], timeoutSec: 5 };
      const thirdPartyEntry = {
        type: 'command',
        exec: 'node',
        args: ['/elsewhere/other-tool.js'],
        timeoutSec: 5,
      };
      const hooks = Object.fromEntries(COPILOT_HOOK_EVENTS.map((event) => [event, [ourEntry]]));
      hooks['PreToolUse'].push(thirdPartyEntry);
      fs.writeFileSync(configPath, JSON.stringify({ version: 1, hooks }, null, 2));

      await runCliServer(tmpHome, async ({ output }) => {
        await waitForCondition(() => output().includes('[CopilotAgents] Hooks installed'));
        const after = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
          version: number;
          hooks: Record<string, Array<{ type: string; exec: string; args: string[] }>>;
        };
        const ourEvents = Object.entries(after.hooks)
          .filter(([, entries]) => entries.some((entry) => entry.args[0] === hookPath))
          .map(([event]) => event)
          .sort();
        expect(ourEvents).toEqual([...COPILOT_HOOK_EVENTS].sort());
        expect(after.version).toBe(1);
        expect(after.hooks['PreToolUse']).toContainEqual(thirdPartyEntry);

        const persistenceConfigPath = path.join(tmpHome, '.copilot-agents', 'config.json');
        const consent = (
          JSON.parse(fs.readFileSync(persistenceConfigPath, 'utf-8')) as {
            hooksConsent?: Record<string, string>;
          }
        ).hooksConsent?.copilot;
        expect(consent).toBe('granted');

        // ZERO friction: nothing that reads as a question or a deferral was
        // printed. The prompt headline, the [Y/n/never] question, and both
        // no-consent notices would each be a prompt this user must not see.
        expect(output()).not.toContain('needs to add its hooks');
        expect(output()).not.toContain('[Y/n/never]');
        expect(output()).not.toContain('needs one-time approval');
        expect(output()).not.toContain('asked again next time');
      });
    },
  );

  // W5: the hook script is copied BEFORE the settings entries, and a failed
  // copy aborts the install. An entry pointing at a script that does not exist
  // makes Copilot CLI spawn a dead `node` for every event — worse than nothing.
  // A regular file where the hooks DIRECTORY belongs makes the copy fail
  // (ENOTDIR) without touching the repo's real dist/.
  itBuilt('writes no hook entries when the hook script cannot be copied', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-cli-nocopy-'));
    fs.mkdirSync(path.join(tmpHome, '.copilot-agents'), { recursive: true });
    fs.mkdirSync(path.join(tmpHome, '.copilot-agents'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, '.copilot-agents', 'config.json'),
      JSON.stringify({ hooksConsent: { copilot: 'granted' } }),
    );
    // hooks/ is a FILE, so copying into hooks/copilot-hook.js fails.
    fs.writeFileSync(path.join(tmpHome, '.copilot-agents', 'hooks'), 'not a directory');

    await runCliServer(tmpHome, async ({ output }) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(fs.existsSync(path.join(tmpHome, '.copilot', 'hooks', 'copilotagents.json'))).toBe(
        false,
      );
      expect(output()).toContain('Hooks NOT installed');
      expect(output()).not.toContain('[CopilotAgents] Hooks installed');
    });
  });

  itBuilt('installs the bundled hook script from the package root on startup', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-cli-home-'));
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-cli-workspace-'));
    // The spawned CLI has no TTY, and without prior consent the first-run gate
    // (rightly) skips hook installation there — seed consent so this test can
    // exercise the actual install path.
    fs.mkdirSync(path.join(tmpHome, '.copilot-agents'), { recursive: true });
    fs.mkdirSync(path.join(tmpHome, '.copilot-agents'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, '.copilot-agents', 'config.json'),
      JSON.stringify({ hooksConsent: { copilot: 'granted' } }),
    );
    const port = await getFreePort();
    const child = spawn(
      process.execPath,
      [CLI_BUNDLE, '--port', port.toString(), '--host', '127.0.0.1'],
      {
        cwd: workspaceDir,
        env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));

    try {
      await waitForCondition(async () => {
        if (child.exitCode !== null) {
          throw new Error(`Bundled CLI exited before startup:\n${output}`);
        }
        try {
          return (await fetch(`http://127.0.0.1:${port.toString()}/api/health`)).ok;
        } catch {
          return false;
        }
      });

      const installedHook = path.join(tmpHome, '.copilot-agents', 'hooks', 'copilot-hook.js');
      await waitForCondition(() => fs.existsSync(installedHook));
      expect(fs.readFileSync(installedHook, 'utf-8')).toContain('#!/usr/bin/env node');
      if (process.platform !== 'win32') {
        expect(fs.statSync(installedHook).mode & 0o100).toBeTruthy();
      }

      const configPath = path.join(tmpHome, '.copilot', 'hooks', 'copilotagents.json');
      const settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      expect(JSON.stringify(settings)).toContain(installedHook);
    } finally {
      await stopChild(child);
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });
});
