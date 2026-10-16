import * as vscode from 'vscode';

import type {
  AgentOrderProgress,
  AgentToolDone,
  AgentToolsClear,
  AgentToolStart,
  ExecuteAgentOrder,
  ModelPreference,
  ServerMessage,
} from '../../core/src/messages.js';

export interface ActiveAgentTask {
  agentId: number;
  agentName: string;
  role: string;
  order: string;
  cts: vscode.CancellationTokenSource;
  startTime: number;
}

export class AutonomousAgentRunner {
  private readonly activeTasks = new Map<number, ActiveAgentTask>();
  private readonly outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('CopilotPixel Autonomous Agents');
  }

  /**
   * Selects the most cost-effective and lightweight model available for background execution.
   * Prioritizes low-cost/fast models (e.g. gpt-4o-mini, gemini-flash) to preserve subscription limits.
   */
  async selectBackgroundModel(
    preference: ModelPreference = 'cheapest',
  ): Promise<vscode.LanguageModelChat | null> {
    if (!('lm' in vscode) || typeof vscode.lm.selectChatModels !== 'function') {
      return null;
    }

    try {
      const allModels = await vscode.lm.selectChatModels();
      if (!allModels || allModels.length === 0) {
        return null;
      }

      const isLightweight = (m: vscode.LanguageModelChat): boolean => {
        const text = `${m.family} ${m.name} ${m.id}`.toLowerCase();
        return /mini|flash|luna|haiku|turbo|small|lite/.test(text);
      };

      if (preference === 'copilot') {
        const copilotModels = allModels.filter((m) => m.vendor?.toLowerCase() === 'copilot');
        const light = copilotModels.find(isLightweight);
        if (light) return light;
        if (copilotModels.length > 0) return copilotModels[0];
      } else if (preference === 'gemini') {
        const geminiModels = allModels.filter(
          (m) =>
            m.vendor?.toLowerCase() === 'google' ||
            m.vendor?.toLowerCase() === 'gemini' ||
            m.family?.toLowerCase().includes('gemini'),
        );
        const light = geminiModels.find(isLightweight);
        if (light) return light;
        if (geminiModels.length > 0) return geminiModels[0];
      }

      // 'cheapest' / auto preference: Pick any lightweight model across providers
      const lightModel = allModels.find(isLightweight);
      if (lightModel) return lightModel;

      // Fallback: Pick any copilot model, then any model
      const copilotFallback = allModels.find((m) => m.vendor?.toLowerCase() === 'copilot');
      return copilotFallback || allModels[0];
    } catch (err) {
      this.log(`Error selecting chat model: ${String(err)}`);
      return null;
    }
  }

  isAgentRunning(agentId: number): boolean {
    return this.activeTasks.has(agentId);
  }

  getActiveTask(agentId: number): ActiveAgentTask | undefined {
    return this.activeTasks.get(agentId);
  }

  cancelOrder(agentId: number, postMessage?: (msg: ServerMessage) => void): boolean {
    const task = this.activeTasks.get(agentId);
    if (!task) return false;

    task.cts.cancel();
    this.activeTasks.delete(agentId);

    this.log(`[Agent #${agentId} ${task.agentName}] Order cancelled: "${task.order}"`);

    if (postMessage) {
      const cancelProgress: AgentOrderProgress = {
        type: 'agentOrderProgress',
        agentId,
        status: 'cancelled',
        message: 'Order cancelled by user.',
      };
      postMessage(cancelProgress);

      const clearTools: AgentToolsClear = {
        type: 'agentToolsClear',
        id: agentId,
      };
      postMessage(clearTools);
    }

    return true;
  }

  async executeOrder(
    req: ExecuteAgentOrder,
    postMessage: (msg: ServerMessage) => void,
  ): Promise<void> {
    const {
      agentId,
      order,
      role = 'Coder',
      agentName = `Agent #${agentId}`,
      modelPreference = 'cheapest',
    } = req;

    // If already running, cancel the previous execution first
    if (this.activeTasks.has(agentId)) {
      this.cancelOrder(agentId, postMessage);
    }

    const cts = new vscode.CancellationTokenSource();
    this.activeTasks.set(agentId, {
      agentId,
      agentName,
      role,
      order,
      cts,
      startTime: Date.now(),
    });

    const token = cts.token;
    this.log(`--------------------------------------------------`);
    this.log(`[Agent #${agentId} ${agentName} (${role})] Starting order: "${order}"`);

    const model = await this.selectBackgroundModel(modelPreference);
    if (!model) {
      const errorMsg =
        'No language models available via VS Code Language Model API. Please ensure GitHub Copilot or Google Gemini extension is installed and signed in.';
      this.log(`[Error] ${errorMsg}`);
      vscode.window.showWarningMessage(`CopilotPixel: ${errorMsg}`);
      postMessage({
        type: 'agentOrderProgress',
        agentId,
        status: 'error',
        message: errorMsg,
      });
      this.activeTasks.delete(agentId);
      return;
    }

    const modelIdentifier = `${model.vendor}/${model.family} (${model.name})`;
    this.log(`[Model] Using lightweight background model: ${modelIdentifier}`);

    postMessage({
      type: 'agentOrderProgress',
      agentId,
      status: 'running',
      message: `Running directive on workspace with ${model.name}...`,
      modelName: model.name,
    });

    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot =
      workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : null;
    const workspaceName =
      workspaceFolders && workspaceFolders.length > 0
        ? workspaceFolders[0].name
        : 'current workspace';

    try {
      const roleGuidelines = this.getRoleGuidelines(role);
      const systemInstruction = `You are ${agentName}, a dedicated AI agent acting as the "${role}" for the project "${workspaceName}".
${roleGuidelines}

You are executing an autonomous background directive on the workspace:
"${order}"

You can interact with the workspace by responding with JSON action blocks. Available tools:
1. List workspace files:
\`\`\`json
{"action": "list_files", "pattern": "**/*"}
\`\`\`
2. Read a file:
\`\`\`json
{"action": "read_file", "path": "path/to/file.ts"}
\`\`\`
3. Write/update a file:
\`\`\`json
{"action": "write_file", "path": "path/to/file.ts", "content": "file content"}
\`\`\`
4. Delegate sub-task to a teammate with a specific role:
\`\`\`json
{"action": "delegate_task", "targetRole": "Tester", "task": "Write unit tests for the changes"}
\`\`\`
5. Spawn a new helper subagent with a role:
\`\`\`json
{"action": "spawn_agent", "role": "Researcher", "name": "Sam", "task": "Investigate existing implementation"}
\`\`\`
6. Finish task:
\`\`\`json
{"action": "finish", "summary": "Detailed summary of what was analyzed, implemented, or recommended."}
\`\`\`

Rules:
- Be concise, efficient, and direct.
- When reading or inspecting code, only read files relevant to the directive.
- If the task is purely analytical, inspect the relevant files and provide a complete finish summary.
- You must always format tool actions in a fenced \`\`\`json { "action": ... } \`\`\` block.`;

      const messages: vscode.LanguageModelChatMessage[] = [
        vscode.LanguageModelChatMessage.User(systemInstruction),
        vscode.LanguageModelChatMessage.User(
          `Begin working on the directive now. Inspect the workspace or files as needed: "${order}"`,
        ),
      ];

      let completed = false;
      let finalSummary = '';
      let iteration = 0;
      const MAX_ITERATIONS = 5;

      while (!completed && iteration < MAX_ITERATIONS && !token.isCancellationRequested) {
        iteration++;
        this.log(`[Agent #${agentId}] Iteration ${iteration}/${MAX_ITERATIONS}...`);

        postMessage({
          type: 'agentOrderProgress',
          agentId,
          status: 'running',
          message: `Thinking and analyzing (step ${iteration}/${MAX_ITERATIONS})...`,
          modelName: model.name,
        });

        const thinkingToolId = `think_${Date.now()}`;
        const thinkStart: AgentToolStart = {
          type: 'agentToolStart',
          id: agentId,
          toolId: thinkingToolId,
          status: `Thinking (step ${iteration})...`,
          toolName: 'runInTerminal',
        };
        postMessage(thinkStart);

        let responseText = '';
        try {
          const response = await model.sendRequest(messages, {}, token);
          for await (const chunk of response.text) {
            if (token.isCancellationRequested) break;
            responseText += chunk;
          }
        } finally {
          const thinkDone: AgentToolDone = {
            type: 'agentToolDone',
            id: agentId,
            toolId: thinkingToolId,
          };
          postMessage(thinkDone);
        }

        if (token.isCancellationRequested) break;

        this.log(`[Agent #${agentId} Response]\n${responseText.trim()}\n`);
        messages.push(vscode.LanguageModelChatMessage.Assistant(responseText));

        const action = this.parseAction(responseText);
        if (!action) {
          // If no tool was called, treat the text as the final summary
          finalSummary = responseText.trim();
          completed = true;
          break;
        }

        if (action.action === 'finish') {
          finalSummary = action.summary || 'Task completed successfully.';
          completed = true;
          break;
        }

        if (action.action === 'read_file' && action.path) {
          const filePath = action.path;
          this.log(`[Agent #${agentId}] Reading workspace file: ${filePath}`);

          const readToolId = `read_${Date.now()}`;
          postMessage({
            type: 'agentOrderProgress',
            agentId,
            status: 'reading',
            message: `Reading ${filePath}...`,
            modelName: model.name,
          });

          const readStart: AgentToolStart = {
            type: 'agentToolStart',
            id: agentId,
            toolId: readToolId,
            status: `Reading ${filePath}`,
            toolName: 'readFile',
          };
          postMessage(readStart);

          let fileContent = '';
          try {
            if (workspaceRoot) {
              const fileUri = vscode.Uri.joinPath(workspaceRoot, filePath);
              const fileBytes = await vscode.workspace.fs.readFile(fileUri);
              fileContent = Buffer.from(fileBytes).toString('utf-8');
              // Truncate if excessively long to keep prompt efficient
              if (fileContent.length > 12000) {
                fileContent = fileContent.slice(0, 12000) + '\n\n[... truncated for brevity ...]';
              }
            } else {
              fileContent = 'Error: No workspace root folder open.';
            }
          } catch (readErr) {
            fileContent = `Error reading file ${filePath}: ${String(readErr)}`;
          } finally {
            const readDone: AgentToolDone = {
              type: 'agentToolDone',
              id: agentId,
              toolId: readToolId,
            };
            postMessage(readDone);
          }

          messages.push(
            vscode.LanguageModelChatMessage.User(
              `Result of reading "${filePath}":\n\`\`\`\n${fileContent}\n\`\`\`\nProceed with the next step or call "finish".`,
            ),
          );
        } else if (action.action === 'list_files') {
          const pattern = action.pattern || '**/*';
          this.log(`[Agent #${agentId}] Listing workspace files with pattern: ${pattern}`);

          let fileListText = '';
          try {
            const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 25);
            const relativePaths = uris.map((u) => vscode.workspace.asRelativePath(u));
            fileListText = relativePaths.join('\n') || '(no files found)';
          } catch (listErr) {
            fileListText = `Error listing files: ${String(listErr)}`;
          }

          messages.push(
            vscode.LanguageModelChatMessage.User(
              `Files found in workspace matching "${pattern}":\n${fileListText}\nProceed with the next step.`,
            ),
          );
        } else if (
          action.action === 'write_file' &&
          action.path &&
          typeof action.content === 'string'
        ) {
          const filePath = action.path;
          this.log(`[Agent #${agentId}] Writing workspace file: ${filePath}`);

          const writeToolId = `write_${Date.now()}`;
          postMessage({
            type: 'agentOrderProgress',
            agentId,
            status: 'writing',
            message: `Editing ${filePath}...`,
            modelName: model.name,
          });

          const writeStart: AgentToolStart = {
            type: 'agentToolStart',
            id: agentId,
            toolId: writeToolId,
            status: `Editing ${filePath}`,
            toolName: 'editFiles',
          };
          postMessage(writeStart);

          let writeResult = '';
          try {
            if (workspaceRoot) {
              const fileUri = vscode.Uri.joinPath(workspaceRoot, filePath);
              const bytes = Buffer.from(action.content, 'utf-8');
              await vscode.workspace.fs.writeFile(fileUri, bytes);
              writeResult = `File ${filePath} written successfully.`;
            } else {
              writeResult = 'Error: No workspace root folder open.';
            }
          } catch (writeErr) {
            writeResult = `Error writing file ${filePath}: ${String(writeErr)}`;
          } finally {
            const writeDone: AgentToolDone = {
              type: 'agentToolDone',
              id: agentId,
              toolId: writeToolId,
            };
            postMessage(writeDone);
          }

          messages.push(
            vscode.LanguageModelChatMessage.User(
              `${writeResult}\nProceed with next step or finish.`,
            ),
          );
        } else if (action.action === 'delegate_task') {
          const targetRole = action.targetRole || 'Coder';
          const subTask = action.task || 'Assist with task';
          this.log(`[Agent #${agentId}] Delegating task to role ${targetRole}: "${subTask}"`);

          postMessage({
            type: 'agentOrderProgress',
            agentId,
            status: 'delegating',
            message: `Delegated sub-task to ${targetRole}: "${subTask}"`,
            modelName: model.name,
            delegation: {
              toRole: targetRole,
              task: subTask,
            },
          });

          messages.push(
            vscode.LanguageModelChatMessage.User(
              `Sub-task successfully delegated to ${targetRole}. You may continue your remaining work or call "finish".`,
            ),
          );
        } else if (action.action === 'spawn_agent') {
          const spawnRole = action.role || 'Coder';
          const spawnName = action.name || 'Assistant';
          const subTask = action.task || 'Assist with task';
          this.log(
            `[Agent #${agentId}] Spawning new agent ${spawnName} (${spawnRole}) for: "${subTask}"`,
          );

          postMessage({
            type: 'agentOrderProgress',
            agentId,
            status: 'spawning',
            message: `Spawned ${spawnName} (${spawnRole}) for directive: "${subTask}"`,
            modelName: model.name,
            delegation: {
              spawnedRole: spawnRole,
              spawnedName: spawnName,
              task: subTask,
            },
          });

          messages.push(
            vscode.LanguageModelChatMessage.User(
              `New subagent ${spawnName} (${spawnRole}) has been spawned in the office and assigned to "${subTask}". You may continue your work or call "finish".`,
            ),
          );
        } else {
          // Unknown action
          messages.push(
            vscode.LanguageModelChatMessage.User(
              'Unrecognized action block. Please call read_file, list_files, write_file, or finish.',
            ),
          );
        }
      }

      if (token.isCancellationRequested) {
        this.log(`[Agent #${agentId}] Execution cancelled.`);
        return;
      }

      if (!finalSummary) {
        finalSummary = `Directive finished after ${iteration} steps.`;
      }

      this.log(`[Agent #${agentId}] Finished order successfully.`);
      this.log(`[Summary]\n${finalSummary}\n`);

      postMessage({
        type: 'agentOrderProgress',
        agentId,
        status: 'completed',
        message: finalSummary,
        details: `Completed in ${iteration} step(s) with ${model.name}`,
        modelName: model.name,
      });

      // Clear any remaining tool animations
      postMessage({
        type: 'agentToolsClear',
        id: agentId,
      });

      vscode.window.showInformationMessage(
        `CopilotPixel: [${agentName} - ${role}] Completed task: ${finalSummary.slice(0, 90)}${finalSummary.length > 90 ? '...' : ''}`,
      );
    } catch (err: any) {
      if (token.isCancellationRequested) return;
      const errorMsg = err?.message || String(err);
      this.log(`[Agent #${agentId}] Error during execution: ${errorMsg}`);

      postMessage({
        type: 'agentOrderProgress',
        agentId,
        status: 'error',
        message: `Execution failed: ${errorMsg}`,
      });

      postMessage({
        type: 'agentToolsClear',
        id: agentId,
      });

      vscode.window.showErrorMessage(`CopilotPixel: Agent #${agentId} failed: ${errorMsg}`);
    } finally {
      this.activeTasks.delete(agentId);
    }
  }

  private parseAction(text: string): {
    action: string;
    path?: string;
    content?: string;
    pattern?: string;
    summary?: string;
    targetRole?: string;
    role?: string;
    name?: string;
    task?: string;
  } | null {
    const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed && typeof parsed.action === 'string') {
          return parsed;
        }
      } catch {
        // Continue to fallback
      }
    }

    // Direct JSON object without markdown fences
    const directMatch = text.match(/\{\s*"action"\s*:\s*"[^"]+"[\s\S]*?\}/);
    if (directMatch) {
      try {
        const parsed = JSON.parse(directMatch[0]);
        if (parsed && typeof parsed.action === 'string') {
          return parsed;
        }
      } catch {
        // Ignore
      }
    }

    return null;
  }

  private getRoleGuidelines(role: string): string {
    switch (role) {
      case 'Lead':
        return 'As Project Lead, prioritize strategic decomposition, review project state, organize tasks, coordinate modules, and verify system integrity.';
      case 'Architect':
        return 'As Architect, analyze patterns, contracts, module boundaries, dependencies, performance tradeoffs, and architectural consistency.';
      case 'Coder':
        return 'As Coder, focus on concrete implementation, clean idiomatic code, handling edge cases, and solid function design.';
      case 'Reviewer':
        return 'As Reviewer, audit code quality, correctness, anti-patterns, maintainability, and security vulnerabilities.';
      case 'Tester':
        return 'As Tester, inspect test coverage, test files, regression scenarios, edge conditions, and assertion quality.';
      case 'DevOps':
        return 'As DevOps, inspect CI/CD workflows, build scripts, package manifests, environment configurations, and deployment setups.';
      case 'Researcher':
        return 'As Researcher, explore codebase history, technical documentation, external dependencies, and explain intricate behaviors.';
      default:
        return 'Provide balanced, high-quality engineering support for the workspace.';
    }
  }

  private log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }

  dispose(): void {
    for (const task of this.activeTasks.values()) {
      task.cts.cancel();
    }
    this.activeTasks.clear();
    this.outputChannel.dispose();
  }
}
