export const COPILOT_HOOK_SCRIPT_NAME = 'copilot-hook.js';
export const COPILOT_HOOK_CONFIG_NAME = 'copilotpixel.json';
export const COPILOT_TERMINAL_NAME_PREFIX = 'Copilot CLI';

/** PascalCase selects Copilot CLI's VS Code-compatible snake_case payloads. */
export const COPILOT_HOOK_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'Stop',
  'PermissionRequest',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
] as const;
