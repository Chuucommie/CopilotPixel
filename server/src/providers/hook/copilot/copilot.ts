import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { AgentEvent, HookProvider } from '../../../../../core/src/provider.js';
import {
  BASH_COMMAND_DISPLAY_MAX_LENGTH,
  TASK_DESCRIPTION_DISPLAY_MAX_LENGTH,
} from '../../../constants.js';
import { COPILOT_TERMINAL_NAME_PREFIX } from './constants.js';
import { areHooksInstalled, installHooks, uninstallHooks } from './copilotHookInstaller.js';
import { copilotTeamProvider } from './copilotTeamProvider.js';

function normalizeHookEvent(
  raw: Record<string, unknown>,
): { sessionId: string; event: AgentEvent } | null {
  const eventName = raw.hook_event_name;
  const sessionId = raw.session_id;
  if (typeof eventName !== 'string' || typeof sessionId !== 'string') return null;

  switch (eventName) {
    case 'SessionStart':
      return {
        sessionId,
        event: {
          kind: 'sessionStart',
          source: typeof raw.source === 'string' ? raw.source : undefined,
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
    case 'PreToolUse': {
      const input =
        typeof raw.tool_input === 'object' && raw.tool_input !== null
          ? (raw.tool_input as Record<string, unknown>)
          : {};
      const runInBackground =
        typeof input.run_in_background === 'boolean' ? input.run_in_background : undefined;
      return {
        sessionId,
        event: {
          kind: 'toolStart',
          toolId: `copilot-${Date.now()}`,
          toolName: typeof raw.tool_name === 'string' ? raw.tool_name : 'unknown',
          input,
          runInBackground,
        },
      };
    }
    case 'PostToolUse':
    case 'PostToolUseFailure':
      return { sessionId, event: { kind: 'toolEnd', toolId: 'current' } };
    case 'Stop':
      return { sessionId, event: { kind: 'turnEnd' } };
    case 'Notification':
      if (raw.notification_type === 'permission_prompt') {
        return { sessionId, event: { kind: 'permissionRequest' } };
      }
      return {
        sessionId,
        event: {
          kind: 'turnEnd',
          awaitingInput: raw.notification_type === 'idle_prompt',
        },
      };
    case 'SubagentStart':
      return {
        sessionId,
        event: {
          kind: 'subagentStart',
          parentToolId: typeof raw.parent_tool_id === 'string' ? raw.parent_tool_id : '',
          toolId: typeof raw.tool_id === 'string' ? raw.tool_id : `sub-${Date.now()}`,
          toolName: typeof raw.agent_type === 'string' ? raw.agent_type : 'subagent',
          input: raw.tool_input,
          runInBackground: true,
        },
      };
    case 'PermissionRequest':
      return { sessionId, event: { kind: 'permissionRequest' } };
    default:
      return null;
  }
}

export function formatToolStatus(toolName: string, input?: unknown): string {
  const args = (input ?? {}) as Record<string, unknown>;
  const base = (value: unknown): string => (typeof value === 'string' ? path.basename(value) : '');

  switch (toolName) {
    case 'Read':
    case 'readFile':
    case 'read_file':
      return `Reading ${base(args.file_path || args.filePath || args.path || 'file')}`;
    case 'Edit':
    case 'editFiles':
    case 'edit_files':
    case 'applyChanges':
      return `Editing ${base(args.file_path || args.filePath || args.path || 'file')}`;
    case 'Write':
    case 'writeFile':
    case 'write_file':
      return `Writing ${base(args.file_path || args.filePath || args.path || 'file')}`;
    case 'Bash':
    case 'runCommand':
    case 'run_command':
    case 'runInTerminal': {
      const command = typeof args.command === 'string' ? args.command : '';
      return `Running: ${command.length > BASH_COMMAND_DISPLAY_MAX_LENGTH ? `${command.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH)}…` : command}`;
    }
    case 'Glob':
    case 'findFiles':
    case 'find_files':
      return 'Searching files';
    case 'Grep':
    case 'searchCode':
    case 'search_code':
      return 'Searching code';
    case 'WebFetch':
    case 'fetchWeb':
    case 'web_fetch':
      return 'Fetching web content';
    case 'WebSearch':
    case 'searchWeb':
    case 'web_search':
      return 'Searching the web';
    case 'Agent':
    case 'Task':
    case 'runSubagent':
    case 'subagent': {
      const description = typeof args.description === 'string' ? args.description : '';
      return description
        ? `Subtask: ${description.length > TASK_DESCRIPTION_DISPLAY_MAX_LENGTH ? `${description.slice(0, TASK_DESCRIPTION_DISPLAY_MAX_LENGTH)}…` : description}`
        : 'Running subtask';
    }
    case 'AskUserQuestion':
      return 'Waiting for your answer';
    default:
      return `Using ${toolName}`;
  }
}

export function getWorkspaceStorageRoots(): string[] {
  const customHome = process.env['COPILOT_STORAGE_ROOT'] || process.env['VSCODE_STORAGE_ROOT'];
  if (customHome) {
    return [path.resolve(customHome)];
  }
  if (process.env['VITEST'] || process.env['NODE_ENV'] === 'test') {
    return [];
  }
  const roots: string[] = [];
  const home = os.homedir();

  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'] || path.join(home, 'AppData', 'Roaming');
    roots.push(
      path.join(appData, 'Code', 'User', 'workspaceStorage'),
      path.join(appData, 'Code - Insiders', 'User', 'workspaceStorage'),
      path.join(appData, 'VSCodium', 'User', 'workspaceStorage'),
      path.join(appData, 'Antigravity IDE', 'User', 'workspaceStorage'),
    );
  } else if (process.platform === 'darwin') {
    const appSupport = path.join(home, 'Library', 'Application Support');
    roots.push(
      path.join(appSupport, 'Code', 'User', 'workspaceStorage'),
      path.join(appSupport, 'Code - Insiders', 'User', 'workspaceStorage'),
      path.join(appSupport, 'VSCodium', 'User', 'workspaceStorage'),
      path.join(appSupport, 'Antigravity IDE', 'User', 'workspaceStorage'),
    );
  } else {
    // Linux
    const configHome = process.env['XDG_CONFIG_HOME'] || path.join(home, '.config');
    roots.push(
      path.join(configHome, 'Code', 'User', 'workspaceStorage'),
      path.join(configHome, 'Code - Insiders', 'User', 'workspaceStorage'),
      path.join(configHome, 'VSCodium', 'User', 'workspaceStorage'),
      path.join(configHome, 'Antigravity IDE', 'User', 'workspaceStorage'),
      path.join(
        home,
        '.var',
        'app',
        'com.visualstudio.code',
        'config',
        'Code',
        'User',
        'workspaceStorage',
      ),
    );
  }
  return roots.filter((r) => {
    try {
      return fs.existsSync(r);
    } catch {
      return false;
    }
  });
}

export const copilotProvider: HookProvider = {
  kind: 'hook',
  id: 'copilot',
  displayName: 'GitHub Copilot',
  protocolVersion: 1,
  normalizeHookEvent,
  installHooks,
  uninstallHooks,
  areHooksInstalled,
  consentDisclosure: () => ({
    headline: 'Enable Copilot CLI hooks?',
    disclosure:
      'CopilotAgents adds a dedicated hook file to ~/.copilot/hooks/ to receive session, tool, and permission events. Existing Copilot settings and hook files are left untouched.\n\n' +
      'Copilot CLI sends event names and tool inputs to the local CopilotAgents server. The server listens on 127.0.0.1.\n\n' +
      'You can remove this hook file at any time from Settings → Instant Detection (Hooks).',
  }),
  formatToolStatus,
  team: copilotTeamProvider,
  permissionExemptTools: new Set([
    'Agent',
    'Task',
    'AskUserQuestion',
    'readFile',
    'read_file',
    'findFiles',
    'find_files',
    'searchCode',
    'search_code',
    'fetchWeb',
    'web_fetch',
    'searchWeb',
    'web_search',
  ]),
  subagentToolNames: new Set(['Agent', 'Task', 'runSubagent', 'subagent']),
  readingTools: new Set([
    'Read',
    'Grep',
    'Glob',
    'WebFetch',
    'WebSearch',
    'readFile',
    'read_file',
    'findFiles',
    'find_files',
    'searchCode',
    'search_code',
    'fetchWeb',
    'web_fetch',
    'searchWeb',
    'web_search',
  ]),
  terminalNamePrefix: COPILOT_TERMINAL_NAME_PREFIX,

  getSessionDirs(workspacePath: string): string[] {
    const results: string[] = [];
    const normalizedWs = workspacePath.replace(/\\/g, '/').toLowerCase();
    const roots = getWorkspaceStorageRoots();

    for (const root of roots) {
      try {
        const hashes = fs.readdirSync(root);
        for (const hash of hashes) {
          const hashDir = path.join(root, hash);
          const wsJson = path.join(hashDir, 'workspace.json');
          if (!fs.existsSync(wsJson)) continue;
          try {
            const raw = fs.readFileSync(wsJson, 'utf8');
            const data = JSON.parse(raw);
            const folderUri =
              typeof data.folder === 'string'
                ? data.folder
                : typeof data.workspace === 'string'
                  ? data.workspace
                  : '';
            const decoded = decodeURIComponent(folderUri.replace(/^file:\/\//, ''))
              .replace(/\\/g, '/')
              .toLowerCase();
            if (
              decoded &&
              (decoded === normalizedWs ||
                normalizedWs.startsWith(decoded) ||
                decoded.startsWith(normalizedWs))
            ) {
              const chatSessionsDir = path.join(hashDir, 'chatSessions');
              if (fs.existsSync(chatSessionsDir)) results.push(chatSessionsDir);
              const copilotTranscripts = path.join(hashDir, 'GitHub.copilot-chat', 'transcripts');
              if (fs.existsSync(copilotTranscripts)) results.push(copilotTranscripts);
              const chatEditor = path.join(hashDir, 'chatEditor');
              if (fs.existsSync(chatEditor)) results.push(chatEditor);
            }
          } catch {
            // Ignore unreadable workspace.json
          }
        }
      } catch {
        // Ignore unreadable root
      }
    }

    // Also check standard Copilot CLI session paths
    const copilotHome = process.env['COPILOT_HOME'] || path.join(os.homedir(), '.copilot');
    const cliSessions = path.join(copilotHome, 'session-state');
    if (fs.existsSync(cliSessions)) results.push(cliSessions);
    const cliHistory = path.join(copilotHome, 'sessions');
    if (fs.existsSync(cliHistory)) results.push(cliHistory);

    return results;
  },

  getAllSessionRoots(): string[] {
    const customHome = process.env['COPILOT_STORAGE_ROOT'] || process.env['VSCODE_STORAGE_ROOT'];
    if (customHome) {
      return [path.resolve(customHome)];
    }
    if (process.env['VITEST'] || process.env['NODE_ENV'] === 'test') {
      return [];
    }
    const roots = getWorkspaceStorageRoots();
    const copilotHome = process.env['COPILOT_HOME'] || path.join(os.homedir(), '.copilot');
    const cliSessions = path.join(copilotHome, 'session-state');
    if (fs.existsSync(cliSessions)) roots.push(cliSessions);
    return roots;
  },

  buildLaunchCommand(sessionId, _cwd, opts) {
    return {
      command: 'copilot',
      args: ['--session-id', sessionId, ...(opts?.bypassPermissions ? ['--allow-all'] : [])],
    };
  },
};
