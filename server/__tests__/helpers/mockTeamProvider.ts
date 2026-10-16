import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { TeamProvider } from '../../../core/src/teamProvider.js';

function sidecarPath(jsonlPath: string): string {
  return jsonlPath.replace(/\.jsonl$/, '.meta.json');
}

function parseSidecarMeta(
  jsonlPath: string,
): { agentType: string; toolUseId?: string; description?: string; name?: string } | null {
  const metaPath = sidecarPath(jsonlPath);
  try {
    const raw = fs.readFileSync(metaPath, 'utf-8');
    const data = JSON.parse(raw) as {
      agentType?: unknown;
      toolUseId?: unknown;
      description?: unknown;
      name?: unknown;
    };
    if (typeof data.agentType !== 'string') return null;
    return {
      agentType: data.agentType,
      toolUseId: typeof data.toolUseId === 'string' ? data.toolUseId : undefined,
      description: typeof data.description === 'string' ? data.description : undefined,
      name: typeof data.name === 'string' ? data.name : undefined,
    };
  } catch {
    return null;
  }
}

function teammateDir(projectDir: string, leadSessionId: string): string {
  return path.join(projectDir, leadSessionId, 'subagents');
}

const AGENT_ID_RESULT_PATTERN = /agent_id:\s*([^\s@]+)@(\S+)/;

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { text?: unknown }).text === 'string'
          ? (item as { text: string }).text
          : '',
      )
      .join('\n');
  }
  return '';
}

function readFirstRecords(filePath: string, maxBytes = 8192): Record<string, unknown>[] {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(fd, buf, 0, maxBytes, 0);
    const text = buf.toString('utf-8', 0, bytesRead);
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    const records: Record<string, unknown>[] = [];
    for (const line of lines) {
      try {
        records.push(JSON.parse(line));
      } catch {
        // Incomplete line
      }
    }
    return records;
  } catch {
    return [];
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore
      }
    }
  }
}

const TEAMMATE_SPAWN_TOOLS = new Set(['Agent']);

export const mockTeamProvider: TeamProvider = {
  providerId: 'copilot',

  teammateSpawnTools: TEAMMATE_SPAWN_TOOLS,
  withinTurnSubagentTools: new Set(['Task']),

  isTeammateSpawnCall(toolName, toolInput) {
    return toolName === 'Agent' && toolInput.run_in_background === true;
  },

  extractTeammateNameFromEvent(event) {
    const teammateName = event.teammate_name;
    if (typeof teammateName === 'string') return teammateName;
    const agentType = event.agent_type;
    return typeof agentType === 'string' ? agentType : undefined;
  },

  extractTeammateSpawnFromToolResult(toolName, resultContent) {
    if (!TEAMMATE_SPAWN_TOOLS.has(toolName)) return null;
    const match = AGENT_ID_RESULT_PATTERN.exec(toolResultText(resultContent));
    if (!match) return null;
    return { teammateName: match[1], teamName: match[2] };
  },

  discoverTeammates(projectDir, leadSessionId, teamName) {
    const result: Array<{
      jsonlPath: string;
      teammateName: string;
      sessionId?: string;
      toolUseId?: string;
      description?: string;
      name?: string;
    }> = [];

    const dir = teammateDir(projectDir, leadSessionId);
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      // Missing dir
    }

    for (const entry of entries) {
      if (!entry.endsWith('.jsonl')) continue;
      const jsonlPath = path.join(dir, entry);
      const meta = parseSidecarMeta(jsonlPath);
      if (!meta) continue;
      result.push({
        jsonlPath,
        teammateName: meta.name || meta.agentType,
        toolUseId: meta.toolUseId,
        description: meta.description,
        name: meta.name,
      });
    }

    if (teamName) {
      try {
        const topLevelEntries = fs.readdirSync(projectDir);
        for (const entry of topLevelEntries) {
          if (!entry.endsWith('.jsonl')) continue;
          const fullPath = path.join(projectDir, entry);
          if (path.basename(fullPath, '.jsonl') === leadSessionId) continue;
          const records = readFirstRecords(fullPath);
          for (const record of records) {
            if (record.teamName === teamName && typeof record.agentName === 'string') {
              result.push({
                jsonlPath: fullPath,
                teammateName: record.agentName,
                sessionId: path.basename(fullPath, '.jsonl'),
              });
              break;
            }
          }
        }
      } catch {
        // Unreadable dir
      }
    }

    return result;
  },

  getTeamMetadataForSession(jsonlPath) {
    const records = readFirstRecords(jsonlPath);
    for (const record of records) {
      if (typeof record.teamName === 'string') {
        return {
          teamName: record.teamName,
          agentName: typeof record.agentName === 'string' ? record.agentName : undefined,
        };
      }
    }
    return null;
  },

  extractTeamMetadataFromRecord(record) {
    const teamName = typeof record.teamName === 'string' ? record.teamName : undefined;
    const agentName = typeof record.agentName === 'string' ? record.agentName : undefined;
    if (!teamName && !agentName) return null;
    return { teamName, agentName };
  },

  getTeamMembers(teamName) {
    const configPath = path.join(os.homedir(), '.copilot', 'teams', teamName, 'config.json');
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const data = JSON.parse(raw) as { members?: Array<{ name?: unknown; isActive?: unknown }> };
      if (!Array.isArray(data.members)) return null;
      const active = new Set<string>();
      for (const m of data.members) {
        if (typeof m.name === 'string' && m.isActive !== false) {
          active.add(m.name);
        }
      }
      return active;
    } catch {
      return null;
    }
  },
};
