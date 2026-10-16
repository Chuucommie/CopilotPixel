import * as vscode from 'vscode';

import { FileStateAdapter } from '../../server/src/fileStateAdapter.js';
import {
  COMMAND_EXPORT_DEFAULT_LAYOUT,
  COMMAND_SHOW_PANEL,
  CONFIG_KEY_AUTO_SHOW_PANEL,
  VIEW_ID,
} from './constants.js';
import { CopilotAgentsViewProvider } from './CopilotAgentsViewProvider.js';
import { migrateVsCodeState } from './migrateVsCodeState.js';

let providerInstance: CopilotAgentsViewProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log(
    `[CopilotAgents] COPILOT_AGENTS_DEBUG=${process.env.COPILOT_AGENTS_DEBUG ?? 'not set'}`,
  );

  // Shared file-backed state adapter (VS Code namespace in ~/.copilot-agents/config.json).
  const adapter = new FileStateAdapter({ namespace: 'vscode' });

  // One-time migration from legacy workspaceState/globalState. Idempotent; runs every
  // activate. Warns until all keys are cleared (e.g. if a disk error blocks writes).
  migrateVsCodeState(context, adapter);

  const provider = new CopilotAgentsViewProvider(context, adapter);
  providerInstance = provider;

  context.subscriptions.push(vscode.window.registerWebviewViewProvider(VIEW_ID, provider));

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_SHOW_PANEL, () => {
      vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_EXPORT_DEFAULT_LAYOUT, () => {
      provider.exportDefaultLayout();
    }),
  );

  // Auto-show panel: focus the CopilotAgents panel on startup if the user has
  // opted in via the copilot-agents.autoShowPanel setting.
  const config = vscode.workspace.getConfiguration();
  if (config.get<boolean>(CONFIG_KEY_AUTO_SHOW_PANEL, false)) {
    vscode.commands.executeCommand(`${VIEW_ID}.focus`);
  }
}

export function deactivate() {
  try {
    providerInstance?.dispose();
  } finally {
    providerInstance = undefined;
  }
}
