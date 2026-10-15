import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { HOOK_SCRIPTS_DIR } from '../../../constants.js';
import {
  COPILOT_HOOK_CONFIG_NAME,
  COPILOT_HOOK_EVENTS,
  COPILOT_HOOK_SCRIPT_NAME,
} from './constants.js';

type HookEntry = Record<string, unknown>;
type CopilotHookConfig = {
  version?: number;
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
};

function getCopilotHome(): string {
  return process.env['COPILOT_HOME'] || path.join(os.homedir(), '.copilot');
}

function getConfigPath(): string {
  return path.join(getCopilotHome(), 'hooks', COPILOT_HOOK_CONFIG_NAME);
}

function getHookScriptPath(): string {
  return path.join(os.homedir(), HOOK_SCRIPTS_DIR, COPILOT_HOOK_SCRIPT_NAME);
}

function readConfig(): CopilotHookConfig {
  const filePath = getConfigPath();
  if (!fs.existsSync(filePath)) return { version: 1, hooks: {} };

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CopilotHookConfig;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid Copilot hook configuration: ${filePath}`);
  }
  if (parsed.hooks === undefined) parsed.hooks = {};
  if (!parsed.hooks || typeof parsed.hooks !== 'object' || Array.isArray(parsed.hooks)) {
    throw new Error(`The hooks field in ${filePath} must be an object`);
  }
  return parsed;
}

function isOurHook(entry: HookEntry): boolean {
  return (
    entry.type === 'command' &&
    entry.exec === 'node' &&
    Array.isArray(entry.args) &&
    entry.args[0] === getHookScriptPath()
  );
}

function createHookEntry(): HookEntry {
  return {
    type: 'command',
    exec: 'node',
    args: [getHookScriptPath()],
    timeoutSec: 5,
  };
}

function writeConfig(config: CopilotHookConfig): void {
  const filePath = getConfigPath();
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export async function installHooks(): Promise<void> {
  const config = readConfig();
  const hooks = config.hooks!;
  let changed = false;

  for (const eventName of COPILOT_HOOK_EVENTS) {
    const entries = hooks[eventName];
    if (entries !== undefined && !Array.isArray(entries)) {
      throw new Error(`The ${eventName} hooks in ${getConfigPath()} must be an array`);
    }
    const current = entries ?? [];
    const filtered = current.filter((entry) => !isOurHook(entry));
    hooks[eventName] = [...filtered, createHookEntry()];
    if (JSON.stringify(current) !== JSON.stringify(hooks[eventName])) changed = true;
  }

  if (changed || !fs.existsSync(getConfigPath())) {
    config.version = 1;
    writeConfig(config);
  }
}

export async function uninstallHooks(): Promise<void> {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return;
  const config = readConfig();
  const hooks = config.hooks!;
  let changed = false;

  for (const [eventName, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    const filtered = entries.filter((entry) => !isOurHook(entry));
    if (filtered.length === entries.length) continue;
    changed = true;
    if (filtered.length === 0) delete hooks[eventName];
    else hooks[eventName] = filtered;
  }

  if (!changed) return;
  if (Object.keys(hooks).length === 0) delete config.hooks;
  writeConfig(config);
}

export async function areHooksInstalled(): Promise<boolean> {
  try {
    const config = readConfig();
    return Object.values(config.hooks ?? {}).some(
      (entries) => Array.isArray(entries) && entries.some((entry) => isOurHook(entry)),
    );
  } catch {
    return false;
  }
}

/** Copy the bundled hook to a stable user-level location used by Copilot CLI. */
export function copyHookScript(extensionPath: string): boolean {
  const sourcePath = path.join(extensionPath, 'dist', 'hooks', COPILOT_HOOK_SCRIPT_NAME);
  const destinationPath = getHookScriptPath();
  try {
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(sourcePath)) return false;
    fs.copyFileSync(sourcePath, destinationPath);
    fs.chmodSync(destinationPath, 0o700);
    return true;
  } catch (error) {
    console.error(`[CopilotPixel] Failed to copy Copilot hook script: ${error}`);
    return false;
  }
}
