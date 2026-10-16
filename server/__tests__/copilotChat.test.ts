import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import { adoptExternalSession, findJsonlFilesInDir } from '../src/fileWatcher.js';
import { copilotProvider } from '../src/providers/hook/copilot/copilot.js';
import {
  isCopilotChatRecord,
  processCopilotChatRecord,
  setHookProvider,
} from '../src/transcriptParser.js';
import type { AgentState } from '../src/types.js';

describe('VS Code Copilot Chat Integration', () => {
  let tmpDir: string;
  let agents: AgentStateStore;
  let waitingTimers: Map<number, ReturnType<typeof setTimeout>>;
  let permissionTimers: Map<number, ReturnType<typeof setTimeout>>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-chat-test-'));
    agents = new AgentStateStore();
    waitingTimers = new Map();
    permissionTimers = new Map();
    setHookProvider(copilotProvider);
  });

  afterEach(() => {
    for (const t of waitingTimers.values()) clearTimeout(t);
    for (const t of permissionTimers.values()) clearTimeout(t);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('identifies Copilot Chat record shapes', () => {
    expect(isCopilotChatRecord({ kind: 0, v: {} })).toBe(true);
    expect(isCopilotChatRecord({ kind: 1, k: ['requests', 0] })).toBe(true);
    expect(isCopilotChatRecord({ kind: 2, k: ['requests', 0, 'response', 0] })).toBe(true);
    expect(isCopilotChatRecord({ requests: [] })).toBe(true);
    expect(isCopilotChatRecord({ v: { requests: [] } })).toBe(true);
    expect(isCopilotChatRecord({ type: 'assistant', message: { content: 'hi' } })).toBe(false);
  });

  it('handles kind: 0 (snapshot) with ongoing requests and tool invocations', () => {
    const broadcastEvents: unknown[] = [];
    agents.broadcast = (msg: unknown) => broadcastEvents.push(msg);

    const agent: AgentState = {
      id: 1,
      sessionId: 'session-abc',
      terminalRef: undefined,
      isExternal: true,
      projectDir: tmpDir,
      jsonlFile: path.join(tmpDir, 'session-abc.jsonl'),
      fileOffset: 0,
      lineBuffer: '',
      activeToolIds: new Set(),
      activeToolStatuses: new Map(),
      activeToolNames: new Map(),
      activeSubagentToolIds: new Map(),
      activeSubagentToolNames: new Map(),
      backgroundAgentToolIds: new Set(),
      isWaiting: true,
      permissionSent: false,
      hadToolsInTurn: false,
      lastDataAt: 0,
      linesProcessed: 0,
      seenUnknownRecordTypes: new Set(),
      hookDelivered: false,
      contextTokens: 0,
      maxContextTokens: 200_000,
    };
    agents.set(1, agent);

    const snapshot = {
      kind: 0,
      v: {
        sessionId: 'session-abc',
        requests: [
          {
            requestId: 'req-1',
            message: { text: 'Explain code' },
            response: [
              {
                type: 'toolInvocation',
                toolId: 'call_1',
                name: 'readFile',
                parameters: { filePath: 'server.ts' },
                isComplete: false,
              },
            ],
            // result is undefined -> turn is still active
          },
        ],
      },
    };

    processCopilotChatRecord(1, agent, snapshot, agents, waitingTimers, permissionTimers);

    expect(agent.providerId).toBe('copilot');
    expect(agent.agentName).toBe('Copilot');
    expect(agent.teamName).toBe('GitHub Copilot');
    expect(agent.isWaiting).toBe(false);
    expect(agent.activeToolIds.has('tool_0_readFile')).toBe(true);

    const toolStart = broadcastEvents.find((e: any) => e.type === 'agentToolStart') as any;
    expect(toolStart).toBeDefined();
    expect(toolStart.toolName).toBe('readFile');
    expect(toolStart.status).toContain('server.ts');
  });

  it('handles kind: 1 (new user prompt) and kind: 2 (turn completion with result)', () => {
    const broadcastEvents: unknown[] = [];
    agents.broadcast = (msg: unknown) => broadcastEvents.push(msg);

    const agent: AgentState = {
      id: 2,
      sessionId: 'session-xyz',
      terminalRef: undefined,
      isExternal: true,
      projectDir: tmpDir,
      jsonlFile: path.join(tmpDir, 'session-xyz.jsonl'),
      fileOffset: 0,
      lineBuffer: '',
      activeToolIds: new Set(['tool_old']),
      activeToolStatuses: new Map([['tool_old', 'Running']]),
      activeToolNames: new Map([['tool_old', 'Bash']]),
      activeSubagentToolIds: new Map(),
      activeSubagentToolNames: new Map(),
      backgroundAgentToolIds: new Set(),
      isWaiting: true,
      permissionSent: false,
      hadToolsInTurn: false,
      lastDataAt: 0,
      linesProcessed: 0,
      seenUnknownRecordTypes: new Set(),
      hookDelivered: false,
      contextTokens: 0,
      maxContextTokens: 200_000,
    };
    agents.set(2, agent);

    // 1. User prompt starts turn
    processCopilotChatRecord(
      2,
      agent,
      { kind: 1, k: ['requests', 1], v: { requestId: 'req-2', message: { text: 'Fix bug' } } },
      agents,
      waitingTimers,
      permissionTimers,
    );
    expect(agent.isWaiting).toBe(false);
    expect(agent.activeToolIds.has('chat_turn')).toBe(true);
    expect(agent.activeToolStatuses.get('chat_turn')).toBe('Thinking...');

    // 2. Tool invocation via kind: 2
    processCopilotChatRecord(
      2,
      agent,
      {
        kind: 2,
        k: ['requests', 1, 'response', 0],
        v: {
          type: 'toolInvocation',
          toolId: 'call_2',
          name: 'editFiles',
          parameters: { filePath: 'src/index.ts' },
          isComplete: false,
        },
      },
      agents,
      waitingTimers,
      permissionTimers,
    );
    expect(agent.activeToolNames.get('tool_requests_1_response_0_editFiles')).toBe('editFiles');

    // 2b. Tool complete via kind: 2 -> transitions back to Responding...
    processCopilotChatRecord(
      2,
      agent,
      {
        kind: 2,
        k: ['requests', 1, 'response', 0],
        v: {
          type: 'toolInvocation',
          toolId: 'call_2',
          name: 'editFiles',
          parameters: { filePath: 'src/index.ts' },
          isComplete: true,
        },
      },
      agents,
      waitingTimers,
      permissionTimers,
    );
    expect(agent.activeToolStatuses.get('chat_turn')).toBe('Responding...');

    // 2c. Streaming text delta via kind: 2
    processCopilotChatRecord(
      2,
      agent,
      {
        kind: 2,
        k: ['requests', 1, 'response', 1],
        v: 'I have updated src/index.ts for you.',
      },
      agents,
      waitingTimers,
      permissionTimers,
    );
    expect(agent.activeToolStatuses.get('chat_turn')).toBe('Responding...');

    // 3. Result finished turn via kind: 2
    processCopilotChatRecord(
      2,
      agent,
      {
        kind: 2,
        k: ['requests', 1, 'result'],
        v: { timings: { total: 1234 } },
      },
      agents,
      waitingTimers,
      permissionTimers,
    );
    expect(agent.isWaiting).toBe(true);
    expect(agent.activeToolIds.size).toBe(0);
  });

  it('findJsonlFilesInDir discovers chatSessions and jsonl/json files', () => {
    const wsRoot = path.join(tmpDir, 'workspaceHash');
    const chatDir = path.join(wsRoot, 'chatSessions');
    fs.mkdirSync(chatDir, { recursive: true });

    const chat1 = path.join(chatDir, 'session-1.jsonl');
    const chat2 = path.join(chatDir, 'session-2.json');
    const ignoredState = path.join(chatDir, 'state.vscdb');
    const ignoredWs = path.join(wsRoot, 'workspace.json');

    fs.writeFileSync(chat1, '{}\n');
    fs.writeFileSync(chat2, '{}');
    fs.writeFileSync(ignoredState, 'sqlite');
    fs.writeFileSync(ignoredWs, '{}');

    // Scanning wsRoot should find chatSessions subfiles
    const foundFromWs = findJsonlFilesInDir(wsRoot);
    expect(foundFromWs).toContain(chat1);
    expect(foundFromWs).toContain(chat2);
    expect(foundFromWs).not.toContain(ignoredState);
    expect(foundFromWs).not.toContain(ignoredWs);

    // Scanning chatDir directly
    const foundDirect = findJsonlFilesInDir(chatDir);
    expect(foundDirect).toContain(chat1);
    expect(foundDirect).toContain(chat2);
    expect(foundDirect).not.toContain(ignoredState);
  });

  it('adoptExternalSession sets up Copilot chat agent correctly', () => {
    const chatDir = path.join(tmpDir, 'chatSessions');
    fs.mkdirSync(chatDir, { recursive: true });
    const sessionFile = path.join(chatDir, '9999-copilot-chat.jsonl');
    fs.writeFileSync(
      sessionFile,
      JSON.stringify({
        kind: 0,
        v: {
          sessionId: '9999-copilot-chat',
          requests: [
            {
              requestId: 'r1',
              message: { text: 'hello' },
              result: {},
            },
          ],
        },
      }) + '\n',
    );

    const fileWatchers = new Map();
    const pollingTimers = new Map();
    let persistCount = 0;

    adoptExternalSession(
      sessionFile,
      tmpDir,
      { current: 10 },
      agents,
      fileWatchers,
      pollingTimers,
      waitingTimers,
      permissionTimers,
      () => {
        persistCount++;
      },
    );

    const agent = agents.get(10);
    expect(agent).toBeDefined();
    expect(agent?.providerId).toBe('copilot');
    expect(agent?.agentName).toBe('Copilot');
    expect(agent?.teamName).toBe('GitHub Copilot');
    expect(agent?.sessionId).toBe('9999-copilot-chat');
    expect(persistCount).toBeGreaterThanOrEqual(1);

    // Cleanup watcher
    for (const fw of fileWatchers.values()) fw.close();
    for (const pt of pollingTimers.values()) clearInterval(pt);
  });

  it('getSessionDirs discovers workspaceStorage chat sessions for project path', () => {
    const storageRoot = path.join(tmpDir, 'fakeStorage');
    const wsHash = path.join(storageRoot, 'hash123');
    const chatSessions = path.join(wsHash, 'chatSessions');
    fs.mkdirSync(chatSessions, { recursive: true });

    const myProject = path.join(tmpDir, 'myProject');
    fs.mkdirSync(myProject, { recursive: true });

    fs.writeFileSync(
      path.join(wsHash, 'workspace.json'),
      JSON.stringify({ folder: 'file://' + myProject }),
    );

    process.env['COPILOT_STORAGE_ROOT'] = storageRoot;
    try {
      const dirs = copilotProvider.getSessionDirs?.(myProject) ?? [];
      expect(dirs).toContain(chatSessions);
    } finally {
      delete process.env['COPILOT_STORAGE_ROOT'];
    }
  });
});
