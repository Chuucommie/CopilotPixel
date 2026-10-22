import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  MockCancellationTokenSource,
  mockSelectChatModels,
  mockShowInformationMessage,
  mockShowWarningMessage,
  mockShowErrorMessage,
  mockCreateOutputChannel,
} = vi.hoisted(() => {
  class MockCancellationTokenSource {
    token = { isCancellationRequested: false };
    cancel() {
      this.token.isCancellationRequested = true;
    }
    dispose() {}
  }
  return {
    MockCancellationTokenSource,
    mockSelectChatModels: vi.fn(),
    mockShowInformationMessage: vi.fn(),
    mockShowWarningMessage: vi.fn(),
    mockShowErrorMessage: vi.fn(),
    mockCreateOutputChannel: vi.fn((_name?: string) => ({
      appendLine: vi.fn(),
      dispose: vi.fn(),
    })),
  };
});

vi.mock('vscode', () => ({
  lm: {
    selectChatModels: (...args: any[]) => mockSelectChatModels(...args),
  },
  window: {
    showInformationMessage: (...args: any[]) => mockShowInformationMessage(...args),
    showWarningMessage: (...args: any[]) => mockShowWarningMessage(...args),
    showErrorMessage: (...args: any[]) => mockShowErrorMessage(...args),
    createOutputChannel: (name: string) => mockCreateOutputChannel(name),
  },
  CancellationTokenSource: MockCancellationTokenSource,
  LanguageModelChatMessage: {
    User: (content: string) => ({ role: 'user', content }),
    Assistant: (content: string) => ({ role: 'assistant', content }),
  },
  workspace: {
    workspaceFolders: [
      {
        uri: { fsPath: '/test/workspace' },
        name: 'test-workspace',
      },
    ],
    findFiles: vi.fn(async () => []),
    asRelativePath: (uri: any) => uri.fsPath || 'file.ts',
    fs: {
      readFile: vi.fn(async () => Buffer.from('console.log("hello world");')),
      writeFile: vi.fn(async () => {}),
    },
  },
  Uri: {
    joinPath: (base: any, ...parts: string[]) => ({
      fsPath: `${base.fsPath}/${parts.join('/')}`,
    }),
  },
}));

import { AutonomousAgentRunner } from '../../adapters/vscode/autonomousAgentRunner.js';
import type { ServerMessage } from '../../core/src/messages.js';

describe('AutonomousAgentRunner', () => {
  let runner: AutonomousAgentRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new AutonomousAgentRunner();
  });

  describe('selectBackgroundModel', () => {
    const mockModels = [
      {
        id: 'copilot-gpt4o',
        name: 'GPT-4o (Copilot)',
        vendor: 'copilot',
        family: 'gpt-4o',
        sendRequest: vi.fn(),
      },
      {
        id: 'copilot-mini',
        name: 'GPT-4o-mini (Copilot)',
        vendor: 'copilot',
        family: 'gpt-4o-mini',
        sendRequest: vi.fn(),
      },
      {
        id: 'gemini-flash',
        name: 'Gemini 1.5 Flash (Google)',
        vendor: 'google',
        family: 'gemini-1.5-flash',
        sendRequest: vi.fn(),
      },
    ];

    it('prefers lowest-cost lightweight model under cheapest preference', async () => {
      mockSelectChatModels.mockResolvedValueOnce(mockModels);
      const selected = await runner.selectBackgroundModel('cheapest');
      expect(selected).toBeDefined();
      expect(['copilot-mini', 'gemini-flash']).toContain(selected?.id);
    });

    it('prefers copilot mini model under copilot preference', async () => {
      mockSelectChatModels.mockResolvedValueOnce(mockModels);
      const selected = await runner.selectBackgroundModel('copilot');
      expect(selected?.id).toBe('copilot-mini');
    });

    it('prefers gemini flash model under gemini preference', async () => {
      mockSelectChatModels.mockResolvedValueOnce(mockModels);
      const selected = await runner.selectBackgroundModel('gemini');
      expect(selected?.id).toBe('gemini-flash');
    });

    it('returns null when no chat models are available', async () => {
      mockSelectChatModels.mockResolvedValueOnce([]);
      const selected = await runner.selectBackgroundModel('cheapest');
      expect(selected).toBeNull();
    });
  });

  describe('Order execution lifecycle and cancellation', () => {
    it('manages task tracking and cancels gracefully', () => {
      const messages: ServerMessage[] = [];
      const postMessage = (msg: ServerMessage) => messages.push(msg);

      // Artificially start an active task
      (runner as any).activeTasks.set(42, {
        agentId: 42,
        agentName: 'Alice',
        role: 'Architect',
        order: 'Analyze dependencies',
        cts: new MockCancellationTokenSource(),
        startTime: Date.now(),
      });

      expect(runner.isAgentRunning(42)).toBe(true);

      const cancelled = runner.cancelOrder(42, postMessage);
      expect(cancelled).toBe(true);
      expect(runner.isAgentRunning(42)).toBe(false);

      expect(messages).toContainEqual(
        expect.objectContaining({
          type: 'agentOrderProgress',
          agentId: 42,
          status: 'cancelled',
        }),
      );

      expect(messages).toContainEqual(
        expect.objectContaining({
          type: 'agentToolsClear',
          id: 42,
        }),
      );
    });

    it('notifies error when no language models exist', async () => {
      mockSelectChatModels.mockResolvedValueOnce([]);
      const messages: ServerMessage[] = [];
      const postMessage = (msg: ServerMessage) => messages.push(msg);

      await runner.executeOrder(
        {
          type: 'executeAgentOrder',
          agentId: 10,
          order: 'Run security review',
          role: 'Reviewer',
          agentName: 'Bob',
          modelPreference: 'cheapest',
        },
        postMessage,
      );

      expect(messages).toContainEqual(
        expect.objectContaining({
          type: 'agentOrderProgress',
          agentId: 10,
          status: 'error',
        }),
      );
      expect(mockShowWarningMessage).toHaveBeenCalled();
    });

    it('executes autonomous cycle with tool calling and completion', async () => {
      const fakeModel = {
        id: 'copilot-mini',
        name: 'GPT-4o-mini',
        vendor: 'copilot',
        family: 'gpt-4o-mini',
        sendRequest: vi.fn().mockImplementation(async () => ({
          text: (async function* () {
            yield '```json\n{"action": "read_file", "path": "src/index.ts"}\n```';
          })(),
        })),
      };

      // Second response finishes the order
      fakeModel.sendRequest
        .mockImplementationOnce(async () => ({
          text: (async function* () {
            yield '```json\n{"action": "read_file", "path": "src/index.ts"}\n```';
          })(),
        }))
        .mockImplementationOnce(async () => ({
          text: (async function* () {
            yield '```json\n{"action": "finish", "summary": "Index module analyzed successfully."}\n```';
          })(),
        }));

      mockSelectChatModels.mockResolvedValueOnce([fakeModel]);

      const messages: ServerMessage[] = [];
      const postMessage = (msg: ServerMessage) => messages.push(msg);

      await runner.executeOrder(
        {
          type: 'executeAgentOrder',
          agentId: 5,
          order: 'Audit src/index.ts',
          role: 'Reviewer',
          agentName: 'Inspector',
          modelPreference: 'copilot',
        },
        postMessage,
      );

      // Verify progress events
      expect(messages.some((m) => m.type === 'agentOrderProgress' && m.status === 'reading')).toBe(
        true,
      );
      expect(
        messages.some((m) => m.type === 'agentToolStart' && (m as any).toolName === 'readFile'),
      ).toBe(true);
      expect(
        messages.some((m) => m.type === 'agentOrderProgress' && m.status === 'completed'),
      ).toBe(true);
      expect(mockShowInformationMessage).toHaveBeenCalled();
    });

    it('blocks path traversal attempts in read_file and write_file actions', async () => {
      const fakeModel = {
        id: 'copilot-mini',
        name: 'GPT-4o-mini',
        vendor: 'copilot',
        family: 'gpt-4o-mini',
        sendRequest: vi.fn(),
      };

      fakeModel.sendRequest
        .mockImplementationOnce(async () => ({
          text: (async function* () {
            yield '```json\n{"action": "read_file", "path": "../../etc/passwd"}\n```';
          })(),
        }))
        .mockImplementationOnce(async () => ({
          text: (async function* () {
            yield '```json\n{"action": "write_file", "path": "../../etc/evil", "content": "bad"}\n```';
          })(),
        }))
        .mockImplementationOnce(async () => ({
          text: (async function* () {
            yield '```json\n{"action": "finish", "summary": "Finished review."}\n```';
          })(),
        }));

      mockSelectChatModels.mockResolvedValueOnce([fakeModel]);

      const messages: ServerMessage[] = [];
      const postMessage = (msg: ServerMessage) => messages.push(msg);

      await runner.executeOrder(
        {
          type: 'executeAgentOrder',
          agentId: 7,
          order: 'Attempt path traversal',
          role: 'Coder',
          agentName: 'AttackerAgent',
          modelPreference: 'copilot',
        },
        postMessage,
      );

      // Verify that fs.readFile and fs.writeFile were NOT called with out-of-bounds path
      const vscodeMock = await import('vscode');
      expect(vscodeMock.workspace.fs.readFile).not.toHaveBeenCalled();
      expect(vscodeMock.workspace.fs.writeFile).not.toHaveBeenCalled();
    });
  });
});
