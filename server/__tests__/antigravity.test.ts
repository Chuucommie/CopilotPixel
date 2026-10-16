import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import {
  antigravityProvider,
  formatAntigravityToolStatus,
} from '../src/providers/hook/antigravity/antigravity.js';
import { processTranscriptLine, setHookProvider } from '../src/transcriptParser.js';
import type { AgentState } from '../src/types.js';

function createTestAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 1,
    sessionId: '76b70efa-bf73-4a91-94a5-1f4266001436',
    terminalRef: undefined,
    isExternal: true,
    projectDir: '/test/project',
    jsonlFile: '/test/project/.system_generated/logs/transcript.jsonl',
    fileOffset: 0,
    lineBuffer: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    backgroundAgentToolIds: new Set(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    lastDataAt: 0,
    linesProcessed: 0,
    seenUnknownRecordTypes: new Set(),
    hookDelivered: false,
    contextTokens: 0,
    maxContextTokens: 1_000_000,
    ...overrides,
  } as AgentState;
}

describe('Antigravity Provider', () => {
  it('exposes expected provider metadata and capabilities', () => {
    expect(antigravityProvider.id).toBe('antigravity');
    expect(antigravityProvider.displayName).toBe('Google Antigravity (Gemini)');
    expect(antigravityProvider.protocolVersion).toBe(1);
    expect(antigravityProvider.readingTools.has('view_file')).toBe(true);
    expect(antigravityProvider.readingTools.has('list_dir')).toBe(true);
    expect(antigravityProvider.readingTools.has('grep_search')).toBe(true);
    expect(antigravityProvider.subagentToolNames.has('browser_subagent')).toBe(true);
    expect(antigravityProvider.subagentToolNames.has('invoke_subagent')).toBe(true);
    expect(antigravityProvider.permissionExemptTools.has('view_file')).toBe(true);
    expect(antigravityProvider.permissionExemptTools.has('ask_question')).toBe(true);
    expect(antigravityProvider.contextWindowForModel?.('gemini-3.8-flash')).toBe(1_000_000);
  });

  it('handles getAllSessionRoots and getSessionDirs with ANTIGRAVITY_HOME override', () => {
    // In test environment without override, returns empty
    expect(antigravityProvider.getAllSessionRoots?.()).toEqual([]);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-test-'));
    const brainDir = path.join(tmpDir, 'antigravity-ide', 'brain');
    const cliDir = path.join(tmpDir, 'antigravity-cli');
    fs.mkdirSync(brainDir, { recursive: true });
    fs.mkdirSync(cliDir, { recursive: true });

    process.env['ANTIGRAVITY_HOME'] = tmpDir;
    try {
      const roots = antigravityProvider.getAllSessionRoots?.();
      expect(roots).toContain(brainDir);
      expect(roots).toContain(cliDir);
    } finally {
      delete process.env['ANTIGRAVITY_HOME'];
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('builds correct launch command', () => {
    const launch = antigravityProvider.buildLaunchCommand?.('test-session', '/my/project');
    expect(launch?.command).toBe('agy');
    expect(launch?.args).toContain('/my/project');
  });

  it('formats tool statuses cleanly', () => {
    expect(formatAntigravityToolStatus('view_file', { AbsolutePath: '/src/index.ts' })).toBe(
      'Reading index.ts',
    );
    expect(formatAntigravityToolStatus('write_to_file', { TargetFile: '/src/app.tsx' })).toBe(
      'Writing app.tsx',
    );
    expect(
      formatAntigravityToolStatus('replace_file_content', { TargetFile: '/src/app.tsx' }),
    ).toBe('Editing app.tsx');
    expect(formatAntigravityToolStatus('list_dir', { DirectoryPath: '/home/user/project' })).toBe(
      'Listing project',
    );
    expect(formatAntigravityToolStatus('grep_search', { Query: 'function test' })).toBe(
      'Searching code: function test',
    );
    expect(formatAntigravityToolStatus('search_web', { query: 'vitest matchers' })).toBe(
      'Searching the web: vitest matchers',
    );
    expect(formatAntigravityToolStatus('run_command', { CommandLine: 'npm test' })).toBe(
      'Running: npm test',
    );
    expect(formatAntigravityToolStatus('browser_subagent', { TaskName: 'Verify Canvas UI' })).toBe(
      'Subtask: Verify Canvas UI',
    );
    expect(formatAntigravityToolStatus('ask_question', {})).toBe('Waiting for your answer');

    // Respects rich toolAction if provided
    expect(
      formatAntigravityToolStatus('run_command', {
        CommandLine: 'npm test',
        toolAction: 'Executing unit tests with vitest',
      }),
    ).toBe('Executing unit tests with vitest');
  });

  it('normalizes hook events', () => {
    const start = antigravityProvider.normalizeHookEvent({
      hook_event_name: 'ToolStart',
      session_id: 'sess-1',
      tool_name: 'run_command',
      tool_input: { CommandLine: 'npm test' },
    });
    expect(start?.sessionId).toBe('sess-1');
    expect(start?.event.kind).toBe('toolStart');
    if (start?.event.kind === 'toolStart') {
      expect(start.event.toolName).toBe('run_command');
    }

    const end = antigravityProvider.normalizeHookEvent({
      hook_event_name: 'ToolEnd',
      session_id: 'sess-1',
      tool_id: 'tool-123',
    });
    expect(end?.event.kind).toBe('toolEnd');
    if (end?.event.kind === 'toolEnd') {
      expect(end.event.toolId).toBe('tool-123');
    }
  });
});

describe('Antigravity Transcript Parsing', () => {
  let agents: AgentStateStore;
  let agent: AgentState;
  let messages: Array<Record<string, unknown>>;
  const waitingTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const permissionTimers = new Map<number, ReturnType<typeof setTimeout>>();

  beforeEach(() => {
    setHookProvider(antigravityProvider);
    agents = new AgentStateStore();
    agent = createTestAgent();
    agents.set(1, agent);
    messages = [];
    agents.on('broadcast', (msg) => {
      messages.push(msg as Record<string, unknown>);
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles USER_INPUT turn start', () => {
    agent.isWaiting = true;
    processTranscriptLine(
      1,
      JSON.stringify({
        step_index: 0,
        source: 'USER_EXPLICIT',
        type: 'USER_INPUT',
        status: 'DONE',
        content: 'Hello Gemini',
      }),
      agents,
      waitingTimers,
      permissionTimers,
    );

    expect(agent.isWaiting).toBe(false);
    expect(agent.providerId).toBe('antigravity');
    expect(agent.agentName).toBe('Gemini');
    expect(agent.teamName).toBe('Antigravity');
    expect(messages.some((m) => m.type === 'agentStatus' && m.status === 'active')).toBe(true);
    expect(messages.some((m) => m.type === 'agentTeamInfo' && m.agentName === 'Gemini')).toBe(true);
  });

  it('handles PLANNER_RESPONSE tool_calls and subsequent tool result', () => {
    processTranscriptLine(
      1,
      JSON.stringify({
        step_index: 3,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        tool_calls: [
          {
            name: 'run_command',
            args: {
              CommandLine: '"npm test"',
              toolAction: '"Running unit tests"',
            },
          },
        ],
      }),
      agents,
      waitingTimers,
      permissionTimers,
    );

    expect(agent.activeToolIds.size).toBe(1);
    expect(agent.activeToolNames.get('tool_3_0_run_command')).toBe('run_command');
    expect(agent.activeToolStatuses.get('tool_3_0_run_command')).toBe('Running unit tests');

    const toolStart = messages.find(
      (m) => m.type === 'agentToolStart' && m.toolId === 'tool_3_0_run_command',
    );
    expect(toolStart).toBeDefined();

    // Now tool completes
    processTranscriptLine(
      1,
      JSON.stringify({
        step_index: 4,
        source: 'MODEL',
        type: 'RUN_COMMAND',
        status: 'DONE',
        exit_code: 0,
        content: 'All tests passed',
      }),
      agents,
      waitingTimers,
      permissionTimers,
    );

    expect(agent.activeToolIds.size).toBe(0);
    const toolDone = messages.find(
      (m) => m.type === 'agentToolDone' && m.toolId === 'tool_3_0_run_command',
    );
    expect(toolDone).toBeDefined();
  });

  it('flags browser_subagent with runInBackground: true', () => {
    processTranscriptLine(
      1,
      JSON.stringify({
        step_index: 10,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        tool_calls: [
          {
            name: 'browser_subagent',
            args: {
              TaskName: '"Test Web App"',
              toolAction: '"Testing web app"',
            },
          },
        ],
      }),
      agents,
      waitingTimers,
      permissionTimers,
    );

    const toolStart = messages.find((m) => m.type === 'agentToolStart');
    expect(toolStart).toBeDefined();
    expect(toolStart?.runInBackground).toBe(true);
  });

  it('handles turn completion when PLANNER_RESPONSE has text content without tools', () => {
    agent.activeToolIds.add('lingering_tool');
    processTranscriptLine(
      1,
      JSON.stringify({
        step_index: 20,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        content: 'I have finished the entire task for you.',
      }),
      agents,
      waitingTimers,
      permissionTimers,
    );

    expect(agent.activeToolIds.size).toBe(0);
    expect(messages.some((m) => m.type === 'agentToolDone' && m.toolId === 'lingering_tool')).toBe(
      true,
    );
  });
});
