import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { AgentEvent, HookProvider } from '../../../../../core/src/provider.js';
import { ANTIGRAVITY_PROVIDER_ID, ANTIGRAVITY_TERMINAL_NAME_PREFIX } from './constants.js';

function cleanString(val: unknown): string {
  if (typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return parsed.trim();
    } catch {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

export function formatAntigravityToolStatus(toolName: string, input?: unknown): string {
  const args = (input ?? {}) as Record<string, unknown>;
  const base = (val: unknown): string => path.basename(cleanString(val));

  // If input contains toolAction or toolSummary, prefer it as a rich status
  if (typeof args.toolAction === 'string' && cleanString(args.toolAction)) {
    return cleanString(args.toolAction);
  }
  if (typeof args.toolSummary === 'string' && cleanString(args.toolSummary)) {
    return cleanString(args.toolSummary);
  }

  switch (toolName) {
    case 'view_file':
      return `Reading ${base(args.AbsolutePath) || 'file'}`;
    case 'list_dir':
      return `Listing ${base(args.DirectoryPath) || 'directory'}`;
    case 'write_to_file':
      return `Writing ${base(args.TargetFile) || 'file'}`;
    case 'replace_file_content':
    case 'multi_replace_file_content':
      return `Editing ${base(args.TargetFile) || 'file'}`;
    case 'run_command': {
      const cmd = cleanString(args.CommandLine);
      return cmd.length > 40 ? `Running: ${cmd.slice(0, 40)}…` : `Running: ${cmd}`;
    }
    case 'grep_search':
      return `Searching code: ${cleanString(args.Query) || 'pattern'}`;
    case 'search_web':
      return `Searching the web: ${cleanString(args.query) || 'query'}`;
    case 'read_url_content':
      return 'Fetching web content';
    case 'browser_subagent': {
      const task = cleanString(args.TaskName || args.TaskSummary || 'browser task');
      return `Subtask: ${task.length > 40 ? task.slice(0, 40) + '…' : task}`;
    }
    case 'invoke_subagent': {
      const prompt = cleanString(args.prompt || 'subagent');
      return `Subtask: ${prompt.length > 40 ? prompt.slice(0, 40) + '…' : prompt}`;
    }
    case 'ask_question':
      return 'Waiting for your answer';
    case 'schedule':
      return 'Scheduling task';
    case 'manage_task':
      return 'Managing task';
    default:
      return `Using ${toolName}`;
  }
}

function normalizeHookEvent(
  raw: Record<string, unknown>,
): { sessionId: string; event: AgentEvent } | null {
  const sessionId = typeof raw.session_id === 'string' ? raw.session_id : '';
  if (!sessionId) return null;
  const eventName = typeof raw.hook_event_name === 'string' ? raw.hook_event_name : '';

  switch (eventName) {
    case 'SessionStart':
      return {
        sessionId,
        event: {
          kind: 'sessionStart',
          cwd: typeof raw.cwd === 'string' ? raw.cwd : undefined,
          transcriptPath: typeof raw.transcript_path === 'string' ? raw.transcript_path : undefined,
        },
      };
    case 'SessionEnd':
      return {
        sessionId,
        event: {
          kind: 'sessionEnd',
          reason: typeof raw.reason === 'string' ? raw.reason : undefined,
        },
      };
    case 'ToolStart':
    case 'PreToolUse': {
      const input =
        typeof raw.tool_input === 'object' && raw.tool_input !== null
          ? (raw.tool_input as Record<string, unknown>)
          : {};
      const toolName = typeof raw.tool_name === 'string' ? raw.tool_name : 'unknown';
      const isSubagent = toolName === 'browser_subagent' || toolName === 'invoke_subagent';
      return {
        sessionId,
        event: {
          kind: 'toolStart',
          toolId: typeof raw.tool_id === 'string' ? raw.tool_id : `agy-${Date.now()}`,
          toolName,
          input,
          runInBackground: isSubagent,
        },
      };
    }
    case 'ToolEnd':
    case 'PostToolUse':
      return {
        sessionId,
        event: {
          kind: 'toolEnd',
          toolId: typeof raw.tool_id === 'string' ? raw.tool_id : 'current',
        },
      };
    case 'TurnEnd':
    case 'Stop':
      return { sessionId, event: { kind: 'turnEnd' } };
    case 'PermissionRequest':
      return { sessionId, event: { kind: 'permissionRequest' } };
    default:
      return null;
  }
}

export const antigravityProvider: HookProvider = {
  kind: 'hook',
  id: ANTIGRAVITY_PROVIDER_ID,
  displayName: 'Google Antigravity (Gemini)',
  protocolVersion: 1,
  normalizeHookEvent,
  async installHooks() {},
  async uninstallHooks() {},
  async areHooksInstalled() {
    return true;
  },
  consentDisclosure: () => ({
    headline: 'Enable Antigravity (Gemini) monitoring?',
    disclosure:
      'CopilotAgents tracks Antigravity IDE and CLI agent sessions from ~/.gemini/antigravity-ide/brain/.\n\n' +
      'Session activity, tool calls, and subagent tasks are visualized as Gemini characters in your pixel-art office.\n\n' +
      'No data is sent externally; all monitoring happens locally on 127.0.0.1.',
  }),
  formatToolStatus: formatAntigravityToolStatus,
  permissionExemptTools: new Set([
    'view_file',
    'list_dir',
    'grep_search',
    'search_web',
    'read_url_content',
    'ask_question',
  ]),
  subagentToolNames: new Set(['browser_subagent', 'invoke_subagent']),
  readingTools: new Set(['view_file', 'list_dir', 'grep_search', 'read_url_content', 'search_web']),
  terminalNamePrefix: ANTIGRAVITY_TERMINAL_NAME_PREFIX,
  contextWindowForModel: () => 1_000_000,

  getSessionDirs(workspacePath: string): string[] {
    const results: string[] = [];
    const customHome = process.env['ANTIGRAVITY_HOME'] || process.env['GEMINI_HOME'];
    const baseHome = customHome
      ? path.resolve(customHome)
      : process.env['VITEST'] || process.env['NODE_ENV'] === 'test'
        ? null
        : path.join(os.homedir(), '.gemini');
    if (!baseHome) return results;

    const brainDir = path.join(baseHome, 'antigravity-ide', 'brain');
    if (!fs.existsSync(brainDir)) return results;

    const normalizedWorkspace = workspacePath.replace(/\\/g, '/').toLowerCase();
    try {
      const entries = fs.readdirSync(brainDir);
      const now = Date.now();
      for (const entry of entries) {
        const convDir = path.join(brainDir, entry);
        const logFile = path.join(convDir, '.system_generated', 'logs', 'transcript.jsonl');
        if (!fs.existsSync(logFile)) continue;
        try {
          const stat = fs.statSync(logFile);
          if (now - stat.mtimeMs > 14 * 86400 * 1000) continue;
          const fd = fs.openSync(logFile, 'r');
          const buf = Buffer.alloc(16384);
          const bytesRead = fs.readSync(fd, buf, 0, 16384, 0);
          fs.closeSync(fd);
          const text = buf.toString('utf8', 0, bytesRead).replace(/\\/g, '/').toLowerCase();
          if (text.includes(normalizedWorkspace)) {
            results.push(convDir);
          }
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Brain dir unreadable
    }

    const cliDir = path.join(os.homedir(), '.gemini', 'antigravity-cli');
    if (fs.existsSync(cliDir)) {
      results.push(cliDir);
    }

    return results;
  },

  getAllSessionRoots(): string[] {
    const roots: string[] = [];
    const customHome = process.env['ANTIGRAVITY_HOME'] || process.env['GEMINI_HOME'];
    if (customHome) {
      const baseHome = path.resolve(customHome);
      const brainDir = path.join(baseHome, 'antigravity-ide', 'brain');
      if (fs.existsSync(brainDir)) roots.push(brainDir);
      const cliDir = path.join(baseHome, 'antigravity-cli');
      if (fs.existsSync(cliDir)) roots.push(cliDir);
      return roots;
    }
    if (process.env['VITEST'] || process.env['NODE_ENV'] === 'test') {
      return [];
    }
    const brainDir = path.join(os.homedir(), '.gemini', 'antigravity-ide', 'brain');
    if (fs.existsSync(brainDir)) {
      roots.push(brainDir);
    }
    const cliDir = path.join(os.homedir(), '.gemini', 'antigravity-cli');
    if (fs.existsSync(cliDir)) {
      roots.push(cliDir);
    }
    return roots;
  },

  buildLaunchCommand(sessionId, cwd) {
    return {
      command: 'agy',
      args: ['--cwd', cwd, ...(sessionId ? ['--session-id', sessionId] : [])],
    };
  },
};
