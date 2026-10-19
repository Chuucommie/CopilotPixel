/** Map status prefixes back to tool names for animation selection */
const STATUS_TO_TOOL: Record<string, string> = {
  Reading: 'Read',
  Viewing: 'view_file',
  Searching: 'Grep',
  'Searching code': 'Grep',
  'Searching web': 'WebSearch',
  Listing: 'list_dir',
  Globbing: 'Glob',
  Fetching: 'WebFetch',
  Writing: 'Write',
  Editing: 'Edit',
  Running: 'Bash',
  Task: 'Task',
  Subtask: 'Task',
};

export function extractToolName(status: string): string | null {
  for (const [prefix, tool] of Object.entries(STATUS_TO_TOOL)) {
    if (status.startsWith(prefix)) return tool;
  }
  const first = status.split(/[\s:]/)[0];
  return first || null;
}

// ── Provider capabilities (tool taxonomy for rendering decisions) ────────────
// Populated once by the `providerCapabilities` postMessage after `webviewReady`.
// Modules classifying tools (character animation, subagent creation gate) read
// from here instead of hardcoding tool names.

const providerCaps: {
  readingTools: Set<string>;
  subagentToolNames: Set<string>;
} = {
  readingTools: new Set(),
  subagentToolNames: new Set(),
};

export function setProviderCapabilities(caps: {
  readingTools: string[];
  subagentToolNames: string[];
}): void {
  providerCaps.readingTools = new Set(caps.readingTools);
  providerCaps.subagentToolNames = new Set(caps.subagentToolNames);
}

const FALLBACK_READING_KEYWORDS = [
  'read',
  'view',
  'grep',
  'search',
  'glob',
  'fetch',
  'find',
  'list',
  'cat',
];

export function isReadingToolName(name: string | null | undefined): boolean {
  if (typeof name !== 'string' || !name.trim()) return false;
  if (providerCaps.readingTools.has(name)) return true;
  const lower = name.toLowerCase();
  for (const tool of providerCaps.readingTools) {
    if (tool.toLowerCase() === lower) return true;
  }
  return FALLBACK_READING_KEYWORDS.some((kw) => lower.includes(kw));
}

const FALLBACK_SUBAGENT_NAMES = ['task', 'agent', 'invoke_subagent', 'browser_subagent', 'subtask'];

export function isSubagentToolName(name: string | null | undefined): boolean {
  if (typeof name !== 'string' || !name.trim()) return false;
  if (providerCaps.subagentToolNames.has(name)) return true;
  const lower = name.toLowerCase();
  for (const tool of providerCaps.subagentToolNames) {
    if (tool.toLowerCase() === lower) return true;
  }
  return FALLBACK_SUBAGENT_NAMES.some((kw) => lower.includes(kw));
}
