// ── User-Level Layout Persistence (re-exports from server/) ──
// The user-level persistence contract, surfaced as one adapter-facing barrel so
// VS Code code never reaches into server/src/constants.js directly. Only
// LAYOUT_REVISION_KEY has an adapter consumer today (CopilotAgentsViewProvider);
// the rest travel with it because they describe the same ~/.copilot-agents
// file layout, and splitting the set would leave the next caller guessing which
// half to import from where.
/** @public */
export {
  CONFIG_FILE_NAME,
  LAYOUT_FILE_DIR,
  LAYOUT_FILE_NAME,
  LAYOUT_FILE_POLL_INTERVAL_MS,
  LAYOUT_REVISION_KEY,
} from '../../server/src/constants.js';

// ── Settings Persistence (VS Code globalState keys) ─────────
export const GLOBAL_KEY_SOUND_ENABLED = 'pixel-office.soundEnabled';
export const GLOBAL_KEY_LAST_SEEN_VERSION = 'pixel-office.lastSeenVersion';
export const GLOBAL_KEY_ALWAYS_SHOW_LABELS = 'pixel-office.alwaysShowLabels';
export const GLOBAL_KEY_GHOST_HEADLESS_AGENTS = 'pixel-office.ghostHeadlessAgents';
export const GLOBAL_KEY_WATCH_ALL_SESSIONS = 'pixel-office.watchAllSessions';
export const GLOBAL_KEY_HOOKS_INFO_SHOWN = 'pixel-office.hooksInfoShown';
export const GLOBAL_KEY_SHOW_AREAS = 'pixel-office.showAreas';

/**
 * Folder→Area mappings live inside the shared ~/.copilot-agents/config.json
 * (vscode.areaMappings), not in VS Code globalState. Kept here as a key
 * constant for callers that need to reference it symbolically.
 *
 * @public
 */
export const SETTING_KEY_AREA_MAPPINGS = 'pixel-office.areaMappings';

// ── VS Code Settings (contributes.configuration keys) ───────
export const CONFIG_KEY_AUTO_SHOW_PANEL = 'pixel-office.autoShowPanel';
export const CONFIG_KEY_AUTO_SPAWN_AGENT = 'pixel-office.autoSpawnAgent';

// ── VS Code Identifiers ─────────────────────────────────────
export const VIEW_ID = 'pixel-office.panelView';
export const LEGACY_VIEW_ID = 'copilot-agents.panelView';
export const COMMAND_SHOW_PANEL = 'pixel-office.showPanel';
export const LEGACY_COMMAND_SHOW_PANEL = 'copilot-agents.showPanel';
export const COMMAND_EXPORT_DEFAULT_LAYOUT = 'pixel-office.exportDefaultLayout';
export const LEGACY_COMMAND_EXPORT_DEFAULT_LAYOUT = 'copilot-agents.exportDefaultLayout';
