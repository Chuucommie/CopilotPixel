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

function formatToolStatus(toolName: string, input?: unknown): string {
  const args = (input ?? {}) as Record<string, unknown>;
  const base = (value: unknown): string => (typeof value === 'string' ? path.basename(value) : '');

  switch (toolName) {
    case 'Read':
      return `Reading ${base(args.file_path)}`;
    case 'Edit':
      return `Editing ${base(args.file_path)}`;
    case 'Write':
      return `Writing ${base(args.file_path)}`;
    case 'Bash': {
      const command = typeof args.command === 'string' ? args.command : '';
      return `Running: ${command.length > BASH_COMMAND_DISPLAY_MAX_LENGTH ? `${command.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH)}…` : command}`;
    }
    case 'Glob':
      return 'Searching files';
    case 'Grep':
      return 'Searching code';
    case 'WebFetch':
      return 'Fetching web content';
    case 'WebSearch':
      return 'Searching the web';
    case 'Agent':
    case 'Task': {
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

export const copilotProvider: HookProvider = {
  kind: 'hook',
  id: 'copilot',
  displayName: 'GitHub Copilot CLI',
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
  permissionExemptTools: new Set(['Agent', 'Task', 'AskUserQuestion']),
  subagentToolNames: new Set(['Agent', 'Task']),
  readingTools: new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']),
  terminalNamePrefix: COPILOT_TERMINAL_NAME_PREFIX,
  buildLaunchCommand(sessionId, _cwd, opts) {
    return {
      command: 'copilot',
      args: ['--session-id', sessionId, ...(opts?.bypassPermissions ? ['--allow-all'] : [])],
    };
  },
};
