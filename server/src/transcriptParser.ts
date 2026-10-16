import * as path from 'path';

import { formatAntigravityToolStatus } from './providers/hook/antigravity/antigravity.js';
import {
  copilotProvider,
  formatToolStatus as formatCopilotToolStatus,
} from './providers/hook/copilot/copilot.js';
const debug = process.env.COPILOT_AGENTS_DEBUG !== '0';

import type { HookProvider } from '../../core/src/provider.js';
import type { AgentStateStore } from './agentStateStore.js';
import { TEXT_IDLE_DELAY_MS, TOOL_DONE_DELAY_MS } from './constants.js';
import { updateContextUsage } from './contextUsage.js';
import { hasInlineTeammates, hasPromotedBackgroundAgent } from './teamUtils.js';
import {
  cancelPermissionTimer,
  cancelWaitingTimer,
  clearAgentActivity,
  startPermissionTimer,
  startWaitingTimer,
} from './timerManager.js';
import type { AgentState } from './types.js';

/** Empty set used as safe fallback when no HookProvider is registered. */
const EMPTY_EXEMPT_TOOLS: ReadonlySet<string> = new Set();

/** Hook provider: supplies formatToolStatus + team.extractTeamMetadataFromRecord.
 *  Registered once at startup via setHookProvider(). Functions below assume it's set. */
let hookProvider: HookProvider | null = null;

/** Permission-exempt tools come from the active provider. Fail-open if unset. */
function exemptTools(): ReadonlySet<string> {
  return hookProvider?.permissionExemptTools ?? EMPTY_EXEMPT_TOOLS;
}

/** Whether the given tool name spawns a sub-agent according to the active provider. */
function isSubagentTool(toolName: string | null | undefined): boolean {
  if (!toolName || !hookProvider) return false;
  return hookProvider.subagentToolNames.has(toolName);
}

/** Register the HookProvider that owns CLI-specific formatting and team metadata extraction. */
export function setHookProvider(provider: HookProvider): void {
  hookProvider = provider;
}

/** The registered provider, for modules that need it outside line parsing
 *  (fileWatcher seeds context gauges before any line has been read). */
export function getHookProvider(): HookProvider | null {
  return hookProvider;
}

/** Called when a lead's tool_result reports an async agent launch. The host
 *  reacts by scanning the lead's subagents/ sidecars and classifying each
 *  spawn by its sidecar name: named -> teammate character, unnamed -> shadow-
 *  watched sub-agent (fileWatcher.scanForBackgroundAgentFiles). */
let backgroundAgentDetectedCallback: ((leadAgentId: number) => void) | null = null;

export function setBackgroundAgentDetectedCallback(cb: (leadAgentId: number) => void): void {
  backgroundAgentDetectedCallback = cb;
}

/** Called when a queue-operation record marks a background agent finished.
 *  The host removes the teammate character or stops the shadow watch. */
let backgroundAgentCompletedCallback: ((leadAgentId: number, toolUseId: string) => void) | null =
  null;

export function setBackgroundAgentCompletedCallback(
  cb: (leadAgentId: number, toolUseId: string) => void,
): void {
  backgroundAgentCompletedCallback = cb;
}

/** Notify the host that a spawn tool finished, so it can remove the spawn's
 *  teammate character or stop its shadow watch. Exported for hookEventHandler,
 *  which clears foreground tools on the Stop hook. Safe to fire for tools that
 *  never had a watch — the host's lookups simply miss. */
export function notifyBackgroundAgentCompleted(leadAgentId: number, toolUseId: string): void {
  backgroundAgentCompletedCallback?.(leadAgentId, toolUseId);
}

/** Called when a lead's spawn result names a DIFFERENT team than the one it is
 *  latched to. Every CLI run of a session mints a fresh implicit team, so a
 *  resumed lead that spawns again belongs to the new team; the host removes
 *  the defunct team's teammate characters. */
let teamSwitchCallback: ((leadAgentId: number, previousTeamName: string) => void) | null = null;

export function setTeamSwitchCallback(
  cb: (leadAgentId: number, previousTeamName: string) => void,
): void {
  teamSwitchCallback = cb;
}

/** Format a tool status line. Delegates to the active HookProvider's formatToolStatus.
 *  Invariant: a provider is registered before any transcript lines are parsed. */
export function formatToolStatus(toolName: string, input: Record<string, unknown>): string {
  return hookProvider?.formatToolStatus(toolName, input) ?? `Using ${toolName}`;
}

export function processTranscriptLine(
  agentId: number,
  line: string,
  agents: AgentStateStore,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
): void {
  const agent = agents.get(agentId);
  if (!agent) return;
  agent.lastDataAt = Date.now();
  agent.linesProcessed++;
  try {
    const record = JSON.parse(line);

    // -- Agent Teams: extract team metadata via the active provider --
    // The provider reads its CLI's own field names (e.g. record.teamName + record.agentName).
    // Other CLIs would implement this differently or not at all.
    const teamMeta = hookProvider?.team?.extractTeamMetadataFromRecord(record);
    if (teamMeta?.teamName && teamMeta.teamName !== agent.teamName) {
      agent.teamName = teamMeta.teamName;
      agent.teamNameFromTags = true;
      agent.agentName = teamMeta.agentName;
      agent.isTeamLead = undefined;
      agent.leadAgentId = undefined;
      if (debug) {
        console.log(
          `[CopilotAgents] Agent ${agentId} team metadata: team=${agent.teamName}, role=${agent.agentName ?? 'lead'}`,
        );
      }
      // Link teammates to leads within the same team
      linkTeammates(agentId, agent, agents);

      agents.broadcast({
        type: 'agentTeamInfo',
        id: agentId,
        teamName: agent.teamName,
        agentName: agent.agentName,
        isTeamLead: agent.isTeamLead,
        leadAgentId: agent.leadAgentId,
      });
    }

    // -- Context window usage (drives every agent's context gauge) --
    updateContextUsage(agentId, agent, agents, record, hookProvider);

    // Resilient content extraction: support both record.message.content and record.content
    // The CLI may change structure across versions
    // -- Antigravity (Gemini) transcripts --
    if (record.source && typeof record.type === 'string') {
      processAntigravityRecord(
        agentId,
        agent,
        record as Record<string, unknown>,
        agents,
        waitingTimers,
        permissionTimers,
      );
      return;
    }

    // -- VS Code Copilot Chat transcripts (kind: 0, 1, 2 or requests array) --
    if (isCopilotChatRecord(record as Record<string, unknown>)) {
      processCopilotChatRecord(
        agentId,
        agent,
        record as Record<string, unknown>,
        agents,
        waitingTimers,
        permissionTimers,
      );
      return;
    }

    const assistantContent = record.message?.content ?? record.content;

    if (record.type === 'assistant' && Array.isArray(assistantContent)) {
      const blocks = assistantContent as Array<{
        type: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>;
      const hasToolUse = blocks.some((b) => b.type === 'tool_use');

      if (hasToolUse) {
        cancelWaitingTimer(agentId, waitingTimers);
        agent.isWaiting = false;
        agent.hadToolsInTurn = true;
        agents.broadcast({ type: 'agentStatus', id: agentId, status: 'active' });
        let hasNonExemptTool = false;
        for (const block of blocks) {
          if (block.type === 'tool_use' && block.id) {
            const toolName = block.name || '';
            const status = formatToolStatus(toolName, block.input || {});
            console.log(
              `[CopilotAgents] JSONL: Agent ${agentId} - tool start: ${block.id} ${status}`,
            );
            agent.activeToolIds.add(block.id);
            agent.activeToolStatuses.set(block.id, status);
            agent.activeToolNames.set(block.id, toolName);
            if (!exemptTools().has(toolName)) {
              hasNonExemptTool = true;
            }
            // Detect tmux vs inline team mode from the team provider's spawn predicate.
            if (
              agent.teamName &&
              hookProvider?.team?.isTeammateSpawnCall(toolName, block.input ?? {}) &&
              !agent.teamUsesTmux
            ) {
              agent.teamUsesTmux = true;
              agents.broadcast({
                type: 'agentTeamInfo',
                id: agentId,
                teamName: agent.teamName,
                agentName: agent.agentName,
                isTeamLead: agent.isTeamLead,
                leadAgentId: agent.leadAgentId,
                teamUsesTmux: true,
              });
              for (const [id, teammate] of agents) {
                if (id === agentId || teammate.leadAgentId !== agentId) continue;
                teammate.teamUsesTmux = true;
                agents.broadcast({
                  type: 'agentTeamInfo',
                  id,
                  teamName: teammate.teamName,
                  agentName: teammate.agentName,
                  isTeamLead: teammate.isTeamLead,
                  leadAgentId: teammate.leadAgentId,
                  teamUsesTmux: true,
                });
              }
            }
            // Skip webview message when hooks handle tool visuals (PreToolUse sent it instantly).
            // EXCEPTION: subagent-spawn tools (Task/Agent) ALWAYS use JSONL so the sub-agent
            // character is created with the REAL tool id. SubagentStop and subagentClear use
            // the real id -- a synthetic-id sub-agent from PreToolUse could never be matched.
            // EXCEPTION: inline teammates need JSONL tool events even in hooks mode so their
            // tool activity is displayed correctly.
            const isSubagentSpawn = isSubagentTool(toolName);
            // A spawn call carrying a `name` is a Teammate-to-be: flag it so
            // the webview never creates a Subtask ghost that the teammate
            // character replaces seconds later.
            const isTeammateSpawn =
              isSubagentSpawn &&
              typeof block.input?.name === 'string' &&
              block.input.name.length > 0;
            if (isTeammateSpawn) {
              (agent.teammateSpawnToolIds ??= new Set()).add(block.id);
            }
            const useJsonlToolEvents = agent.hookDelivered && hasInlineTeammates(agentId, agents);
            if (!agent.hookDelivered || useJsonlToolEvents || isSubagentSpawn) {
              const runInBackground = isSubagentSpawn && block.input?.run_in_background === true;
              agents.broadcast({
                type: 'agentToolStart',
                id: agentId,
                toolId: block.id,
                status,
                toolName,
                permissionActive: agent.permissionSent,
                runInBackground,
                isTeammateSpawn: isTeammateSpawn || undefined,
              });
            }
          }
        }
        // Skip heuristic timer when hooks are active OR for teammates.
        // Teammate tools (WebFetch, WebSearch) are naturally slow; the heuristic
        // produces false positives. Permission on teammates comes from the lead's
        // routed Notification(permission_prompt) hook — slower but accurate.
        if (hasNonExemptTool && !agent.hookDelivered && !agent.leadAgentId) {
          startPermissionTimer(agentId, agents, permissionTimers, exemptTools());
        }
      } else if (blocks.some((b) => b.type === 'text') && !agent.hadToolsInTurn) {
        // Text-only response in a turn that hasn't used any tools.
        // turn_duration handles tool-using turns reliably but is never
        // emitted for text-only turns, so we use a silence-based timer:
        // if no new JSONL data arrives within TEXT_IDLE_DELAY_MS, mark as waiting.
        // Skip when hooks are active — Stop hook handles this exactly.
        if (!agent.hookDelivered) {
          startWaitingTimer(agentId, TEXT_IDLE_DELAY_MS, agents, waitingTimers);
        }
      }
    } else if (record.type === 'assistant' && typeof assistantContent === 'string') {
      // Text-only assistant response (content is a string, not an array)
      if (!agent.hadToolsInTurn && !agent.hookDelivered) {
        startWaitingTimer(agentId, TEXT_IDLE_DELAY_MS, agents, waitingTimers);
      }
    } else if (record.type === 'assistant' && assistantContent === undefined) {
      // Assistant record with no recognizable content structure
      console.warn(
        `[CopilotAgents] Agent ${agentId}: assistant record has no content. Keys: ${Object.keys(record).join(', ')}`,
      );
    } else if (record.type === 'progress') {
      processProgressRecord(agentId, record, agents, waitingTimers, permissionTimers);
    } else if (record.type === 'user') {
      const content = record.message?.content ?? record.content;
      if (Array.isArray(content)) {
        const blocks = content as Array<{ type: string; tool_use_id?: string; content?: unknown }>;
        const hasToolResult = blocks.some((b) => b.type === 'tool_result');
        if (hasToolResult) {
          for (const block of blocks) {
            if (block.type === 'tool_result' && block.tool_use_id) {
              const completedToolId = block.tool_use_id;
              const completedToolName = agent.activeToolNames.get(completedToolId);

              // Teammate spawn result (newer harnesses: every Agent spawn is a
              // background teammate of an implicit team; the lead's own records
              // carry no team tags, so this result line is the only lead-side
              // signal). Marks the agent as lead so teammate discovery engages,
              // then falls through to normal tool-done handling -- the teammate
              // character replaces the transient Subtask one.
              const teammateSpawn = completedToolName
                ? hookProvider?.team?.extractTeammateSpawnFromToolResult?.(
                    completedToolName,
                    block.content,
                  )
                : null;
              if (
                teammateSpawn &&
                !agent.teamNameFromTags &&
                !agent.leadAgentId &&
                agent.teamName !== teammateSpawn.teamName
              ) {
                // Last-wins for tag-less LEADS: a resumed session's transcript
                // carries spawn results from several team generations (each CLI
                // run mints a fresh session-<8hex> team). Re-latch to the
                // newest team and drop the defunct team's teammates. Tag-
                // derived identity (tmux/inline, teammate sessions) stays.
                //
                // `!agent.leadAgentId` keeps a TEAMMATE that spawns its own
                // named Agent from re-latching itself out of its team: it would
                // flip to the nested team, set isTeamLead, and linkTeammates
                // would then detach it from its real lead (phantom LEAD, broken
                // click-to-focus). An agent that already has a lead is never a
                // re-latch candidate, whatever its teamNameFromTags says.
                if (agent.teamName) {
                  teamSwitchCallback?.(agentId, agent.teamName);
                }
                agent.teamName = teammateSpawn.teamName;
                agent.isTeamLead = true;
                if (debug) {
                  console.log(
                    `[CopilotAgents] Agent ${agentId} spawned teammate "${teammateSpawn.teammateName}" -> lead of team ${teammateSpawn.teamName}`,
                  );
                }
                linkTeammates(agentId, agent, agents);
                agents.broadcast({
                  type: 'agentTeamInfo',
                  id: agentId,
                  teamName: agent.teamName,
                  agentName: agent.agentName,
                  isTeamLead: agent.isTeamLead,
                  leadAgentId: agent.leadAgentId,
                });
              }

              // Detect background agent launches — keep the tool alive until queue-operation
              if (
                !teammateSpawn &&
                isSubagentTool(completedToolName) &&
                isAsyncAgentResult(block)
              ) {
                console.log(
                  `[CopilotAgents] Agent ${agentId} background agent launched: ${completedToolId}`,
                );
                agent.backgroundAgentToolIds.add(completedToolId);
                // Current harnesses OMIT run_in_background from the tool_use
                // input, so the spawn's original agentToolStart went out
                // unflagged. Re-broadcast it flagged now that the result
                // proves it's background: the webview marks the Subtask as
                // background-parented BEFORE the first turn-end clear, or the
                // sub-character gets removed and recreated at a new tile.
                const spawnStatus = agent.activeToolStatuses.get(completedToolId);
                if (spawnStatus) {
                  agents.broadcast({
                    type: 'agentToolStart',
                    id: agentId,
                    toolId: completedToolId,
                    status: spawnStatus,
                    toolName: completedToolName,
                    runInBackground: true,
                    isTeammateSpawn: agent.teammateSpawnToolIds?.has(completedToolId) || undefined,
                  });
                }
                // Classify the spawn right away (sidecar may lag; the periodic
                // teammate scan retries until it lands).
                backgroundAgentDetectedCallback?.(agentId);
                continue; // don't mark as done yet
              }

              console.log(
                `[CopilotAgents] JSONL: Agent ${agentId} - tool done: ${block.tool_use_id}`,
              );
              // If the completed tool spawned a subagent, clear its subagent tools
              if (isSubagentTool(completedToolName)) {
                agent.activeSubagentToolIds.delete(completedToolId);
                agent.activeSubagentToolNames.delete(completedToolId);
                agents.broadcast({
                  type: 'subagentClear',
                  id: agentId,
                  parentToolId: completedToolId,
                });
                // Stop the shadow watch on a foreground spawn's transcript.
                backgroundAgentCompletedCallback?.(agentId, completedToolId);
              }
              agent.activeToolIds.delete(completedToolId);
              agent.activeToolStatuses.delete(completedToolId);
              agent.activeToolNames.delete(completedToolId);
              // Send agentToolDone when hooks are off, or for Task/Agent tools
              // (which always use JSONL path for consistent sub-agent lifecycle).
              const isCompletedAgentTool =
                completedToolName === 'Task' || completedToolName === 'Agent';
              const useJsonlToolEvents = agent.hookDelivered && hasInlineTeammates(agentId, agents);
              if (!agent.hookDelivered || useJsonlToolEvents || isCompletedAgentTool) {
                const toolId = completedToolId;
                setTimeout(() => {
                  agents.broadcast({
                    type: 'agentToolDone',
                    id: agentId,
                    toolId,
                  });
                }, TOOL_DONE_DELAY_MS);
              }
            }
          }
          // All tools completed — allow text-idle timer as fallback
          // for turn-end detection when turn_duration is not emitted
          if (agent.activeToolIds.size === 0) {
            agent.hadToolsInTurn = false;
          }
        } else {
          // New user text prompt — new turn starting
          cancelWaitingTimer(agentId, waitingTimers);
          clearAgentActivity(agent, agentId, agents, permissionTimers);
          agent.hadToolsInTurn = false;
        }
      } else if (typeof content === 'string' && content.trim()) {
        // New user text prompt — new turn starting
        cancelWaitingTimer(agentId, waitingTimers);
        clearAgentActivity(agent, agentId, agents, permissionTimers);
        agent.hadToolsInTurn = false;
      }
    } else if (record.type === 'queue-operation' && record.operation === 'enqueue') {
      // Background agent completed — parse tool-use-id from XML content
      const content = record.content as string | undefined;
      if (content) {
        const toolIdMatch = content.match(/<tool-use-id>(.*?)<\/tool-use-id>/);
        if (toolIdMatch) {
          const completedToolId = toolIdMatch[1];
          if (agent.backgroundAgentToolIds.has(completedToolId)) {
            console.log(
              `[CopilotAgents] Agent ${agentId} background agent done: ${completedToolId}`,
            );
            agent.backgroundAgentToolIds.delete(completedToolId);
            agent.activeSubagentToolIds.delete(completedToolId);
            agent.activeSubagentToolNames.delete(completedToolId);
            agents.broadcast({
              type: 'subagentClear',
              id: agentId,
              parentToolId: completedToolId,
            });
            agent.activeToolIds.delete(completedToolId);
            agent.activeToolStatuses.delete(completedToolId);
            agent.activeToolNames.delete(completedToolId);
            // Remove the spawn's teammate character or stop its shadow watch.
            backgroundAgentCompletedCallback?.(agentId, completedToolId);
            if (!agent.hookDelivered) {
              const toolId = completedToolId;
              setTimeout(() => {
                agents.broadcast({
                  type: 'agentToolDone',
                  id: agentId,
                  toolId,
                });
              }, TOOL_DONE_DELAY_MS);
            }
          }
        }
      }
    } else if (record.type === 'system' && record.subtype === 'turn_duration') {
      cancelWaitingTimer(agentId, waitingTimers);
      cancelPermissionTimer(agentId, permissionTimers);

      // Definitive turn-end: clean up any stale tool state, but preserve background agents.
      // When hooks are active, the Stop hook already handled the status change,
      // but we still perform state cleanup here as a safety net.
      const hasForegroundTools = agent.activeToolIds.size > agent.backgroundAgentToolIds.size;
      if (hasForegroundTools) {
        // Remove only non-background tool state
        for (const toolId of agent.activeToolIds) {
          if (agent.backgroundAgentToolIds.has(toolId)) continue;
          agent.activeToolIds.delete(toolId);
          agent.activeToolStatuses.delete(toolId);
          const toolName = agent.activeToolNames.get(toolId);
          agent.activeToolNames.delete(toolId);
          if (isSubagentTool(toolName)) {
            agent.activeSubagentToolIds.delete(toolId);
            agent.activeSubagentToolNames.delete(toolId);
            // A foreground spawn dropped at turn end without a tool_result:
            // stop its shadow watch too, or it lingers until sessionEnd.
            backgroundAgentCompletedCallback?.(agentId, toolId);
          }
        }
        if (!agent.hookDelivered) {
          agents.broadcast({ type: 'agentToolsClear', id: agentId });
        }
        // Re-send background agent tools so webview keeps their sub-agents alive.
        // toolName + runInBackground are REQUIRED: without them the webview can't
        // recognize the re-sent tool as a subagent spawn and never recreates the
        // Subtask sub-character. Skip tools whose agent was promoted to its own
        // character -- re-sending would spawn a ghost Subtask alongside it.
        for (const toolId of agent.backgroundAgentToolIds) {
          if (hasPromotedBackgroundAgent(agentId, toolId, agents)) continue;
          const status = agent.activeToolStatuses.get(toolId);
          if (status) {
            agents.broadcast({
              type: 'agentToolStart',
              id: agentId,
              toolId,
              status,
              toolName: agent.activeToolNames.get(toolId),
              runInBackground: true,
              isTeammateSpawn: agent.teammateSpawnToolIds?.has(toolId) || undefined,
            });
          }
        }
      } else if (agent.activeToolIds.size > 0 && agent.backgroundAgentToolIds.size === 0) {
        agent.activeToolIds.clear();
        agent.activeToolStatuses.clear();
        agent.activeToolNames.clear();
        agent.activeSubagentToolIds.clear();
        agent.activeSubagentToolNames.clear();
        if (!agent.hookDelivered) {
          agents.broadcast({ type: 'agentToolsClear', id: agentId });
        }
      }

      agent.isWaiting = true;
      agent.permissionSent = false;
      agent.hadToolsInTurn = false;
      // Skip status post when hooks already handled it
      if (!agent.hookDelivered) {
        agents.broadcast({
          type: 'agentStatus',
          id: agentId,
          status: 'waiting',
          // turn_duration = the turn completed, so this is "Done".
          awaitingInput: false,
        });
      }
    } else if (record.type && !agent.seenUnknownRecordTypes.has(record.type)) {
      // Log first occurrence of unrecognized record types to help diagnose issues
      // where the CLI changes format. Known types we intentionally skip:
      // file-history-snapshot, queue-operation (non-enqueue), etc.
      const knownSkippableTypes = new Set(['file-history-snapshot', 'system', 'queue-operation']);
      if (!knownSkippableTypes.has(record.type)) {
        agent.seenUnknownRecordTypes.add(record.type);
        if (debug) {
          console.log(
            `[CopilotAgents] JSONL: Agent ${agentId} - unrecognized record type '${record.type}'. ` +
              `Keys: ${Object.keys(record).join(', ')}`,
          );
        }
      }
    }
  } catch {
    // Ignore malformed lines
  }
}

function processProgressRecord(
  agentId: number,
  record: Record<string, unknown>,
  agents: AgentStateStore,
  _waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
): void {
  const agent = agents.get(agentId);
  if (!agent) return;

  const parentToolId = record.parentToolUseID as string | undefined;
  if (!parentToolId) return;

  const data = record.data as Record<string, unknown> | undefined;
  if (!data) return;

  // bash_progress / mcp_progress: tool is actively executing, not stuck on permission.
  // Restart the permission timer to give the running tool another window.
  // Skip when hooks are active — Notification hook handles permission detection exactly.
  const dataType = data.type as string | undefined;
  if (dataType === 'bash_progress' || dataType === 'mcp_progress') {
    if (agent.activeToolIds.has(parentToolId) && !agent.hookDelivered && !agent.leadAgentId) {
      startPermissionTimer(agentId, agents, permissionTimers, exemptTools());
    }
    return;
  }

  // Verify parent is an active subagent-spawning tool (agent_progress handling)
  const parentToolName = agent.activeToolNames.get(parentToolId);
  if (!isSubagentTool(parentToolName)) return;

  const msg = data.message as Record<string, unknown> | undefined;
  if (!msg) return;

  const msgType = msg.type as string;
  const innerMsg = msg.message as Record<string, unknown> | undefined;
  const content = innerMsg?.content;
  if (!Array.isArray(content)) return;

  if (msgType === 'assistant') {
    let hasNonExemptSubTool = false;
    for (const block of content) {
      if (block.type === 'tool_use' && block.id) {
        const toolName = block.name || '';
        const status = formatToolStatus(toolName, block.input || {});
        console.log(
          `[CopilotAgents] Agent ${agentId} subagent tool start: ${block.id} ${status} (parent: ${parentToolId})`,
        );

        // Track sub-tool IDs
        let subTools = agent.activeSubagentToolIds.get(parentToolId);
        if (!subTools) {
          subTools = new Set();
          agent.activeSubagentToolIds.set(parentToolId, subTools);
        }
        subTools.add(block.id);

        // Track sub-tool names (for permission checking)
        let subNames = agent.activeSubagentToolNames.get(parentToolId);
        if (!subNames) {
          subNames = new Map();
          agent.activeSubagentToolNames.set(parentToolId, subNames);
        }
        subNames.set(block.id, toolName);

        if (!exemptTools().has(toolName)) {
          hasNonExemptSubTool = true;
        }

        agents.broadcast({
          type: 'subagentToolStart',
          id: agentId,
          parentToolId,
          toolId: block.id,
          status,
        });
      }
    }
    if (hasNonExemptSubTool && !agent.hookDelivered) {
      startPermissionTimer(agentId, agents, permissionTimers, exemptTools());
    }
  } else if (msgType === 'user') {
    for (const block of content) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        console.log(
          `[CopilotAgents] Agent ${agentId} subagent tool done: ${block.tool_use_id} (parent: ${parentToolId})`,
        );

        // Remove from tracking
        const subTools = agent.activeSubagentToolIds.get(parentToolId);
        if (subTools) {
          subTools.delete(block.tool_use_id);
        }
        const subNames = agent.activeSubagentToolNames.get(parentToolId);
        if (subNames) {
          subNames.delete(block.tool_use_id);
        }

        const toolId = block.tool_use_id;
        setTimeout(() => {
          agents.broadcast({
            type: 'subagentToolDone',
            id: agentId,
            parentToolId,
            toolId,
          });
        }, 300);
      }
    }
    // If there are still active non-exempt sub-agent tools, restart the permission timer
    // (handles the case where one sub-agent completes but another is still stuck)
    let stillHasNonExempt = false;
    for (const [, subNames] of agent.activeSubagentToolNames) {
      for (const [, toolName] of subNames) {
        if (!exemptTools().has(toolName)) {
          stillHasNonExempt = true;
          break;
        }
      }
      if (stillHasNonExempt) break;
    }
    if (stillHasNonExempt && !agent.hookDelivered) {
      startPermissionTimer(agentId, agents, permissionTimers, exemptTools());
    }
  }
}

/**
 * Link teammates within the same team.
 * The lead is the agent with no agentName (or one already marked isTeamLead).
 * Teammates get leadAgentId pointing to the lead. If only named teammates are
 * tracked, linking waits until the lead is detected.
 */
function linkTeammates(_agentId: number, agent: AgentState, agents: AgentStateStore): void {
  const teamName = agent.teamName;
  if (!teamName) return;

  // Find all agents in this team
  const teamAgents: AgentState[] = [];
  for (const a of agents.values()) {
    if (a.teamName === teamName) {
      teamAgents.push(a);
    }
  }

  // Determine lead: always prefer the agent WITHOUT agentName (the real lead has agentName=null).
  // This handles the case where a teammate is detected first and temporarily marked as lead,
  // then the real lead joins later.
  let lead: AgentState | undefined;
  for (const a of teamAgents) {
    if (!a.agentName) {
      lead = a;
      break;
    }
  }
  if (!lead) {
    // No agent without agentName -- an already-marked lead may carry one
    for (const a of teamAgents) {
      if (a.isTeamLead) {
        lead = a;
        break;
      }
    }
  }
  if (!lead) {
    // Every tracked member carries an agentName: they are all teammates and
    // the real lead's session isn't tracked (yet). Don't badge a teammate as
    // LEAD -- this re-runs and links properly once the lead is detected.
    return;
  }

  // Update all team members: mark lead, clear stale lead flags, link teammates
  for (const a of teamAgents) {
    if (a.id === lead.id) {
      a.isTeamLead = true;
      a.leadAgentId = undefined;
    } else {
      a.isTeamLead = false;
      a.leadAgentId = lead.id;
    }
  }
}

/** Check if a tool_result block indicates an async/background agent launch */
function isAsyncAgentResult(block: Record<string, unknown>): boolean {
  const content = block.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).text === 'string' &&
        ((item as Record<string, unknown>).text as string).startsWith(
          'Async agent launched successfully.',
        )
      ) {
        return true;
      }
    }
  } else if (typeof content === 'string') {
    return content.startsWith('Async agent launched successfully.');
  }
  return false;
}

function processAntigravityRecord(
  agentId: number,
  agent: AgentState,
  record: Record<string, unknown>,
  agents: AgentStateStore,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
): void {
  agent.providerId = 'antigravity';
  if (!agent.agentName) {
    agent.agentName = 'Gemini';
    agent.teamName = 'Antigravity';
    agents.broadcast({
      type: 'agentTeamInfo',
      id: agentId,
      agentName: 'Gemini',
      teamName: 'Antigravity',
    });
  }

  // 1. User message (turn start)
  if (record.source === 'USER_EXPLICIT' && record.type === 'USER_INPUT') {
    cancelWaitingTimer(agentId, waitingTimers);
    cancelPermissionTimer(agentId, permissionTimers);
    agent.isWaiting = false;
    agent.hadToolsInTurn = false;
    agents.broadcast({ type: 'agentStatus', id: agentId, status: 'active' });
    return;
  }

  // 2. Planner response (tool calls OR final assistant text)
  if (record.source === 'MODEL' && record.type === 'PLANNER_RESPONSE') {
    const toolCalls = Array.isArray(record.tool_calls) ? record.tool_calls : [];

    if (toolCalls.length > 0) {
      cancelWaitingTimer(agentId, waitingTimers);
      cancelPermissionTimer(agentId, permissionTimers);
      agent.isWaiting = false;
      agent.hadToolsInTurn = true;
      agents.broadcast({ type: 'agentStatus', id: agentId, status: 'active' });

      for (let i = 0; i < toolCalls.length; i++) {
        const call = toolCalls[i] as { name?: string; args?: Record<string, unknown> };
        const toolName = call.name || 'unknown';
        const rawArgs = call.args || {};
        const parsedArgs: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rawArgs)) {
          if (typeof v === 'string') {
            const trimmed = v.trim();
            if (
              (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
              (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
              (trimmed.startsWith('[') && trimmed.endsWith(']'))
            ) {
              try {
                parsedArgs[k] = JSON.parse(trimmed);
              } catch {
                parsedArgs[k] = v;
              }
            } else {
              parsedArgs[k] = v;
            }
          } else {
            parsedArgs[k] = v;
          }
        }

        const toolId = `tool_${record.step_index ?? Date.now()}_${i}_${toolName}`;
        const status = formatAntigravityToolStatus(toolName, parsedArgs);
        if (debug) {
          console.log(
            `[CopilotAgents] Antigravity: Agent ${agentId} - tool start: ${toolId} ${status}`,
          );
        }

        agent.activeToolIds.add(toolId);
        agent.activeToolStatuses.set(toolId, status);
        agent.activeToolNames.set(toolId, toolName);

        const isSubagent = toolName === 'browser_subagent' || toolName === 'invoke_subagent';

        agents.broadcast({
          type: 'agentToolStart',
          id: agentId,
          toolId,
          status,
          toolName,
          permissionActive: false,
          runInBackground: isSubagent,
        });
      }
    } else if (typeof record.content === 'string' && record.content.length > 0) {
      // Final response text -> turn finished!
      for (const toolId of agent.activeToolIds) {
        agents.broadcast({ type: 'agentToolDone', id: agentId, toolId });
      }
      agent.activeToolIds.clear();
      agent.activeToolStatuses.clear();
      agent.activeToolNames.clear();

      startWaitingTimer(agentId, TEXT_IDLE_DELAY_MS, agents, waitingTimers);
    }
    return;
  }

  // 3. Tool results (RUN_COMMAND, SEARCH_WEB, BROWSER_SUBAGENT, etc.)
  if (
    record.source === 'MODEL' &&
    (record.type === 'RUN_COMMAND' ||
      record.type === 'SEARCH_WEB' ||
      record.type === 'BROWSER_SUBAGENT' ||
      record.type === 'READ_URL_CONTENT' ||
      record.type === 'ASK_QUESTION' ||
      record.type === 'GENERIC')
  ) {
    const typeToTool: Record<string, string> = {
      RUN_COMMAND: 'run_command',
      SEARCH_WEB: 'search_web',
      BROWSER_SUBAGENT: 'browser_subagent',
      READ_URL_CONTENT: 'read_url_content',
      ASK_QUESTION: 'ask_question',
    };
    const targetTool = typeToTool[record.type as string];

    let foundToolId: string | null = null;
    if (targetTool) {
      for (const [id, name] of agent.activeToolNames) {
        if (name === targetTool) {
          foundToolId = id;
          break;
        }
      }
    }
    if (!foundToolId && agent.activeToolIds.size > 0) {
      foundToolId = agent.activeToolIds.values().next().value ?? null;
    }

    if (foundToolId) {
      if (debug) {
        console.log(`[CopilotAgents] Antigravity: Agent ${agentId} - tool done: ${foundToolId}`);
      }
      agents.broadcast({ type: 'agentToolDone', id: agentId, toolId: foundToolId });
      agent.activeToolIds.delete(foundToolId);
      agent.activeToolStatuses.delete(foundToolId);
      agent.activeToolNames.delete(foundToolId);
    }
    return;
  }
}

export function isCopilotChatRecord(record: Record<string, unknown>): boolean {
  if (record.kind === 0 || record.kind === 1 || record.kind === 2) return true;
  if (Array.isArray(record.requests)) return true;
  if (
    record.v &&
    typeof record.v === 'object' &&
    Array.isArray((record.v as Record<string, unknown>).requests)
  )
    return true;
  return false;
}

export function processCopilotChatRecord(
  agentId: number,
  agent: AgentState,
  record: Record<string, unknown>,
  agents: AgentStateStore,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
): void {
  agent.providerId = 'copilot';
  if (!agent.agentName) {
    agent.agentName = 'Copilot';
    agent.teamName = 'GitHub Copilot';
    agents.broadcast({
      type: 'agentTeamInfo',
      id: agentId,
      agentName: 'Copilot',
      teamName: 'GitHub Copilot',
    });
  }

  const extractMessage = (msg: unknown): string | null => {
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
    if (msg && typeof msg === 'object' && typeof (msg as { value?: unknown }).value === 'string') {
      const val = (msg as { value: string }).value.trim();
      if (val) return val;
    }
    return null;
  };

  const parseToolItem = (
    item: unknown,
  ): {
    toolName: string;
    input: Record<string, unknown>;
    status: string;
    isComplete?: boolean;
  } | null => {
    if (!item || typeof item !== 'object') return null;
    const obj = item as Record<string, unknown>;

    // Handle references / context reading in Copilot
    if (
      obj.kind === 'references' ||
      obj.kind === 'reference' ||
      obj.kind === 'inlineReference' ||
      obj.kind === 'codeCitations'
    ) {
      let filePath = '';
      if (Array.isArray(obj.references) && obj.references.length > 0) {
        const ref = obj.references[0] as Record<string, unknown>;
        const uri = (ref.uri || ref.resource || ref) as Record<string, unknown>;
        filePath = (uri.path || uri.fsPath || uri.value || '') as string;
      } else if (obj.reference && typeof obj.reference === 'object') {
        const ref = obj.reference as Record<string, unknown>;
        const uri = (ref.uri || ref) as Record<string, unknown>;
        filePath = (uri.path || uri.fsPath || uri.value || '') as string;
      } else if (Array.isArray(obj.citations) && obj.citations.length > 0) {
        const cit = obj.citations[0] as Record<string, unknown>;
        const val = (cit.value || cit) as Record<string, unknown>;
        filePath = (val.path || val.fsPath || '') as string;
      }
      const fileName = filePath ? path.basename(filePath) : 'file';
      const status = `Reading ${fileName}`;
      return {
        toolName: 'readFile',
        input: { filePath },
        status,
        isComplete: false,
      };
    }

    // Handle textEditGroup / file edits in Copilot
    if (obj.kind === 'textEditGroup' || obj.kind === 'undoStop') {
      if (obj.kind === 'textEditGroup') {
        const uri = (obj.uri || obj.resource) as Record<string, unknown> | string;
        const filePath =
          typeof uri === 'string' ? uri : ((uri?.path || uri?.fsPath || '') as string);
        const fileName = filePath ? path.basename(filePath) : 'file';
        const status = `Editing ${fileName}`;
        return {
          toolName: 'editFiles',
          input: { filePath },
          status,
          isComplete: false,
        };
      }
    }
    if (
      obj.type === 'toolInvocation' ||
      obj.kind === 'toolInvocation' ||
      obj.kind === 'toolInvocationSerialized' ||
      obj.kind === 'prepareToolInvocation' ||
      obj.kind === 'progressTask' ||
      obj.toolId ||
      obj.toolCallId ||
      obj.toolInvocationToken
    ) {
      let rawName = (obj.name || obj.toolName || obj.tool || obj.toolId || obj.id || '') as string;
      const input = (obj.parameters ||
        obj.input ||
        obj.args ||
        (obj.resultDetails as Record<string, unknown>)?.input ||
        {}) as Record<string, unknown>;

      if ((obj.toolSpecificData as { kind?: string })?.kind === 'terminal') {
        rawName = 'runInTerminal';
        const termData = obj.toolSpecificData as {
          commandLine?: { original?: string; toolEdited?: string; userEdited?: string };
        };
        if (termData?.commandLine) {
          input.command =
            termData.commandLine.userEdited ||
            termData.commandLine.toolEdited ||
            termData.commandLine.original ||
            input.command;
        }
      }

      const isComplete =
        obj.isComplete === true ||
        obj.status === 'completed' ||
        obj.result !== undefined ||
        obj.isConfirmed !== undefined;

      const invocationMsg = extractMessage(obj.invocationMessage || obj.message || obj.content);
      const pastTenseMsg = extractMessage(obj.pastTenseMessage);
      let status = isComplete && pastTenseMsg ? pastTenseMsg : invocationMsg;

      // Fallback inference from status if rawName is generic/missing
      if ((!rawName || rawName === 'tool' || rawName === 'progressTask') && status) {
        if (/^reading/i.test(status)) rawName = 'readFile';
        else if (/^editing/i.test(status)) rawName = 'editFiles';
        else if (/^searching/i.test(status)) rawName = 'searchCode';
        else if (/^running/i.test(status)) rawName = 'runInTerminal';
      }

      const cleanName =
        rawName.replace(/^(copilot_|vscode_|tools_)/, '').replace(/^.*[./]/, '') || 'tool';

      if (!status) {
        status = formatCopilotToolStatus(cleanName, input);
      }
      return { toolName: cleanName, input, status, isComplete };
    }
    if (obj.call && typeof obj.call === 'object') {
      const call = obj.call as Record<string, unknown>;
      const rawName = (call.name || call.tool || call.toolId || 'tool') as string;
      const cleanName =
        rawName.replace(/^(copilot_|vscode_|tools_)/, '').replace(/^.*[./]/, '') || 'tool';
      const input = (call.args || call.parameters || {}) as Record<string, unknown>;
      const isComplete = obj.isComplete === true;
      const invocationMsg = extractMessage(call.invocationMessage || obj.invocationMessage);
      const pastTenseMsg = extractMessage(call.pastTenseMessage || obj.pastTenseMessage);
      let status = isComplete && pastTenseMsg ? pastTenseMsg : invocationMsg;
      if (!status) {
        status = formatCopilotToolStatus(cleanName, input);
      }
      return { toolName: cleanName, input, status, isComplete };
    }
    return null;
  };

  const clearAllTools = () => {
    if (agent.activeToolIds.size > 0) {
      for (const toolId of agent.activeToolIds) {
        agents.broadcast({ type: 'agentToolDone', id: agentId, toolId });
      }
      agent.activeToolIds.clear();
      agent.activeToolStatuses.clear();
      agent.activeToolNames.clear();
      agents.broadcast({ type: 'agentToolsClear', id: agentId });
    }
  };

  // Case A: Snapshot (kind === 0) or raw chat object
  const snapshot =
    record.kind === 0 && record.v && typeof record.v === 'object'
      ? (record.v as Record<string, unknown>)
      : Array.isArray(record.requests)
        ? record
        : null;

  if (snapshot) {
    const requests = Array.isArray(snapshot.requests)
      ? (snapshot.requests as Array<Record<string, unknown>>)
      : [];
    if (requests.length === 0) {
      clearAllTools();
      agent.isWaiting = true;
      agent.hadToolsInTurn = false;
      agents.broadcast({
        type: 'agentStatus',
        id: agentId,
        status: 'waiting',
        awaitingInput: true,
      });
      return;
    }

    const lastReq = requests[requests.length - 1];
    const isFinished = lastReq.result !== undefined && lastReq.result !== null;

    if (isFinished) {
      cancelWaitingTimer(agentId, waitingTimers);
      cancelPermissionTimer(agentId, permissionTimers);
      clearAllTools();
      agent.isWaiting = true;
      agent.hadToolsInTurn = false;
      agents.broadcast({
        type: 'agentStatus',
        id: agentId,
        status: 'waiting',
        awaitingInput: true,
      });
    } else {
      cancelWaitingTimer(agentId, waitingTimers);
      cancelPermissionTimer(agentId, permissionTimers);
      agent.isWaiting = false;
      agent.hadToolsInTurn = true;
      agents.broadcast({ type: 'agentStatus', id: agentId, status: 'active' });

      const responses = Array.isArray(lastReq.response) ? (lastReq.response as unknown[]) : [];
      let latestActiveTool: {
        toolName: string;
        input: Record<string, unknown>;
        status: string;
        index: number;
      } | null = null;

      for (let i = 0; i < responses.length; i++) {
        const parsed = parseToolItem(responses[i]);
        if (parsed && !parsed.isComplete) {
          latestActiveTool = {
            toolName: parsed.toolName,
            input: parsed.input,
            status: parsed.status,
            index: i,
          };
        }
      }

      if (latestActiveTool) {
        const toolId = `tool_${latestActiveTool.index}_${latestActiveTool.toolName}`;
        const status = latestActiveTool.status;
        if (!agent.activeToolIds.has(toolId)) {
          clearAllTools();
          agent.activeToolIds.add(toolId);
          agent.activeToolStatuses.set(toolId, status);
          agent.activeToolNames.set(toolId, latestActiveTool.toolName);
          agents.broadcast({
            type: 'agentToolStart',
            id: agentId,
            toolId,
            status,
            toolName: latestActiveTool.toolName,
            permissionActive: false,
            runInBackground: copilotProvider.subagentToolNames.has(latestActiveTool.toolName),
          });
        }
      } else {
        clearAllTools();
        const thinkToolId = 'chat_turn';
        agent.activeToolIds.add(thinkToolId);
        agent.activeToolStatuses.set(thinkToolId, 'Responding...');
        agent.activeToolNames.set(thinkToolId, 'Chat');
        agents.broadcast({
          type: 'agentToolStart',
          id: agentId,
          toolId: thinkToolId,
          status: 'Responding...',
          toolName: 'Chat',
          permissionActive: false,
        });
      }

      startWaitingTimer(agentId, TEXT_IDLE_DELAY_MS, agents, waitingTimers);
    }
    return;
  }

  // Case B: kind === 1 (New user request)
  if (record.kind === 1) {
    cancelWaitingTimer(agentId, waitingTimers);
    cancelPermissionTimer(agentId, permissionTimers);
    clearAgentActivity(agent, agentId, agents, permissionTimers);
    agent.isWaiting = false;
    agent.hadToolsInTurn = false;
    agents.broadcast({ type: 'agentStatus', id: agentId, status: 'active' });

    const thinkToolId = 'chat_turn';
    agent.activeToolIds.add(thinkToolId);
    agent.activeToolStatuses.set(thinkToolId, 'Thinking...');
    agent.activeToolNames.set(thinkToolId, 'Chat');
    agents.broadcast({
      type: 'agentToolStart',
      id: agentId,
      toolId: thinkToolId,
      status: 'Thinking...',
      toolName: 'Chat',
      permissionActive: false,
    });
    return;
  }

  // Case C: kind === 2 (Mutation / streaming delta)
  if (record.kind === 2) {
    cancelWaitingTimer(agentId, waitingTimers);
    cancelPermissionTimer(agentId, permissionTimers);

    const keyPath = Array.isArray(record.k) ? record.k.map(String) : [];
    const val = record.v;

    if (
      keyPath.includes('result') ||
      (val && typeof val === 'object' && 'result' in (val as Record<string, unknown>))
    ) {
      clearAllTools();
      agent.isWaiting = true;
      agent.hadToolsInTurn = false;
      agents.broadcast({
        type: 'agentStatus',
        id: agentId,
        status: 'waiting',
        awaitingInput: true,
      });
      return;
    }

    if (keyPath.includes('isComplete') && val === true) {
      for (const toolId of [...agent.activeToolIds]) {
        if (toolId !== 'chat_turn') {
          agent.activeToolIds.delete(toolId);
          agent.activeToolStatuses.delete(toolId);
          agent.activeToolNames.delete(toolId);
          agents.broadcast({ type: 'agentToolDone', id: agentId, toolId });
        }
      }
      if (agent.activeToolIds.size === 0) {
        const respToolId = 'chat_turn';
        agent.activeToolIds.add(respToolId);
        agent.activeToolStatuses.set(respToolId, 'Responding...');
        agent.activeToolNames.set(respToolId, 'Chat');
        agents.broadcast({
          type: 'agentToolStart',
          id: agentId,
          toolId: respToolId,
          status: 'Responding...',
          toolName: 'Chat',
          permissionActive: false,
        });
      }
      return;
    }

    const parsed = parseToolItem(val);
    if (parsed) {
      agent.isWaiting = false;
      agents.broadcast({ type: 'agentStatus', id: agentId, status: 'active' });

      // If generic chat_turn is running, replace it with this specific tool
      if (agent.activeToolIds.has('chat_turn')) {
        agent.activeToolIds.delete('chat_turn');
        agent.activeToolStatuses.delete('chat_turn');
        agent.activeToolNames.delete('chat_turn');
        agents.broadcast({ type: 'agentToolDone', id: agentId, toolId: 'chat_turn' });
      }

      const toolId = `tool_${keyPath.join('_')}_${parsed.toolName}`;
      if (parsed.isComplete) {
        if (agent.activeToolIds.has(toolId)) {
          agent.activeToolIds.delete(toolId);
          agent.activeToolStatuses.delete(toolId);
          agent.activeToolNames.delete(toolId);
          agents.broadcast({ type: 'agentToolDone', id: agentId, toolId });
        }
        if (agent.activeToolIds.size === 0) {
          const respToolId = 'chat_turn';
          agent.activeToolIds.add(respToolId);
          agent.activeToolStatuses.set(respToolId, 'Responding...');
          agent.activeToolNames.set(respToolId, 'Chat');
          agents.broadcast({
            type: 'agentToolStart',
            id: agentId,
            toolId: respToolId,
            status: 'Responding...',
            toolName: 'Chat',
            permissionActive: false,
          });
        }
      } else {
        const status = parsed.status;
        if (!agent.activeToolIds.has(toolId)) {
          agent.activeToolIds.add(toolId);
          agent.activeToolStatuses.set(toolId, status);
          agent.activeToolNames.set(toolId, parsed.toolName);
          agents.broadcast({
            type: 'agentToolStart',
            id: agentId,
            toolId,
            status,
            toolName: parsed.toolName,
            permissionActive: false,
            runInBackground: copilotProvider.subagentToolNames.has(parsed.toolName),
          });
        }
      }
      return;
    }

    // Markdown text streaming / generation
    agent.isWaiting = false;
    agents.broadcast({ type: 'agentStatus', id: agentId, status: 'active' });

    if (
      agent.activeToolIds.size === 0 ||
      (agent.activeToolIds.size === 1 && agent.activeToolIds.has('chat_turn'))
    ) {
      const respToolId = 'chat_turn';
      agent.activeToolIds.add(respToolId);
      agent.activeToolStatuses.set(respToolId, 'Responding...');
      agent.activeToolNames.set(respToolId, 'Chat');
      agents.broadcast({
        type: 'agentToolStart',
        id: agentId,
        toolId: respToolId,
        status: 'Responding...',
        toolName: 'Chat',
        permissionActive: false,
      });
    }

    startWaitingTimer(agentId, TEXT_IDLE_DELAY_MS, agents, waitingTimers);
    return;
  }
}
