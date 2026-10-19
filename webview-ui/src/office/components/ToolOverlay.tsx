import { useEffect, useState } from 'react';

import { Button } from '../../components/ui/Button.js';
import {
  CHARACTER_SITTING_OFFSET_PX,
  CONTEXT_CRITICAL_THRESHOLD,
  CONTEXT_DANGER_THRESHOLD,
  CONTEXT_GAUGE_BG,
  CONTEXT_GAUGE_COLOR_CRITICAL,
  CONTEXT_GAUGE_COLOR_DANGER,
  CONTEXT_GAUGE_COLOR_OK,
  CONTEXT_GAUGE_COLOR_WARN,
  CONTEXT_GAUGE_HEIGHT_PX,
  CONTEXT_GAUGE_WIDTH_PX,
  CONTEXT_WARN_THRESHOLD,
  TEAM_LEAD_COLOR,
  TOOL_OVERLAY_VERTICAL_OFFSET,
} from '../../constants.js';
import type { SubagentCharacter } from '../../hooks/useExtensionMessages.js';
import { getRoleDefinition } from '../agentRoles.js';
import type { OfficeState } from '../engine/officeState.js';
import { overlayProjection } from '../projection.js';
import type { ToolActivity } from '../types.js';
import { CharacterState } from '../types.js';

// Both turn-end states show the green checkmark bubble. A finished turn (Stop)
// shows ONLY the checkmark (the label falls through to its normal idle text);
// going idle waiting on the user (Notification(idle_prompt)) additionally
// surfaces this label. Driven by Character.waitingAwaitingInput.
const WAITING_INPUT_ACTIVITY_TEXT = 'Waiting for input';

interface ToolOverlayProps {
  officeState: OfficeState;
  agents: number[];
  agentTools: Record<number, ToolActivity[]>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  subagentCharacters: SubagentCharacter[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
  onCloseAgent: (id: number) => void;
  alwaysShowOverlay: boolean;
}

/** Derive a short human-readable activity string from tools/status */
function getActivityText(
  agentId: number,
  agentTools: Record<number, ToolActivity[]>,
  isActive: boolean,
  bubbleType: 'permission' | 'waiting' | null,
  waitingAwaitingInput: boolean,
): string {
  if (bubbleType === 'permission') return 'Needs approval';
  if (bubbleType === 'waiting' && waitingAwaitingInput) return WAITING_INPUT_ACTIVITY_TEXT;

  const tools = agentTools[agentId];
  if (tools && tools.length > 0) {
    // Find the latest non-done tool
    const activeTool = [...tools].reverse().find((t) => !t.done);
    if (activeTool) {
      if (activeTool.permissionWait) return 'Needs approval';
      return activeTool.status;
    }
    // All tools done but agent still active (mid-turn) — keep showing last tool status
    if (isActive) {
      const lastTool = tools[tools.length - 1];
      if (lastTool) return lastTool.status;
    }
  }

  if (isActive) {
    return 'Thinking...';
  }

  if (bubbleType === 'waiting') {
    return 'Done';
  }

  return 'Waiting for input';
}

function getFuelColor(ratio: number): string {
  if (ratio >= CONTEXT_CRITICAL_THRESHOLD) return CONTEXT_GAUGE_COLOR_CRITICAL;
  if (ratio >= CONTEXT_DANGER_THRESHOLD) return CONTEXT_GAUGE_COLOR_DANGER;
  if (ratio >= CONTEXT_WARN_THRESHOLD) return CONTEXT_GAUGE_COLOR_WARN;
  return CONTEXT_GAUGE_COLOR_OK;
}

export function ToolOverlay({
  officeState,
  agents,
  agentTools,
  subagentTools,
  subagentCharacters,
  containerRef,
  zoom,
  panRef,
  onCloseAgent,
  alwaysShowOverlay,
}: ToolOverlayProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const el = containerRef.current;
  if (!el) return null;
  const project = overlayProjection(
    officeState.getLayout(),
    el.getBoundingClientRect(),
    zoom,
    panRef.current,
    window.devicePixelRatio || 1,
  );

  const selectedId = officeState.selectedAgentId;
  const hoveredId = officeState.hoveredAgentId;

  // All character IDs
  // All character IDs (deduplicated to prevent duplicate key or stacking overlay cascades)
  const allIds = Array.from(new Set([...agents, ...subagentCharacters.map((s) => s.id)]));

  return (
    <>
      {allIds.map((id) => {
        const ch = officeState.characters.get(id);
        if (!ch) return null;

        const isSelected = selectedId === id;
        const isHovered = hoveredId === id;
        const isSub = ch.isSubagent;

        // Position above character
        const sittingOffset =
          ch.state === CharacterState.TYPE || ch.isSitting ? CHARACTER_SITTING_OFFSET_PX : 0;
        const screenX = project.toScreenX(ch.x);
        const screenY = project.toScreenY(ch.y + sittingOffset - TOOL_OVERLAY_VERTICAL_OFFSET);

        // Only show for hovered or selected agents (unless always-show is on)
        if (!alwaysShowOverlay && !isSelected && !isHovered) {
          if (ch.speechBubbleText && (ch.speechBubbleTimer || 0) > 0) {
            return (
              <div
                key={`bubble-${id}`}
                className="absolute flex flex-col items-center -translate-x-1/2 pointer-events-none z-50"
                style={{ left: screenX, top: screenY - 24 }}
                data-testid="speech-bubble"
                data-agent-id={id}
              >
                <div className="px-3 py-1.5 bg-white/95 text-slate-900 border border-slate-700 font-semibold text-2xs rounded-lg shadow-xl animate-bounce max-w-[280px] text-center whitespace-normal break-words leading-tight relative">
                  <span>{ch.speechBubbleText}</span>
                  <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] border-t-white" />
                </div>
              </div>
            );
          }
          return null;
        }

        // A "Done" agent (finished turn: waiting bubble without awaitingInput)
        // shows ONLY its floating green checkmark bubble, never the label panel
        // (the panel would cover the bubble). Render an empty positioned marker
        // so overlay counts stay stable and hover/select can still bring the
        // panel back. When always-show is off, the early return above already
        // keeps the panel hidden for idle agents.
        const isDone = ch.bubbleType === 'waiting' && !ch.waitingAwaitingInput;
        if (isDone && !isSelected && !isHovered) {
          return (
            <div
              key={id}
              className="absolute"
              style={{ left: screenX, top: screenY, pointerEvents: 'none' }}
              data-testid="agent-overlay"
              data-agent-id={id}
            />
          );
        }

        // Tools and activity text
        const tools = agentTools[id];
        const hasWaitingBubble = ch.bubbleType === 'waiting';
        const subHasPermission = isSub && ch.bubbleType === 'permission';
        let activityText: string;
        if (ch.isTakingBreak) {
          activityText = ch.routineActivity
            ? `${ch.routineIcon || '⏳'} ${ch.routineActivity}`
            : `☕ Break (${ch.breakType || 'relax'})`;
        } else if (hasWaitingBubble && ch.waitingAwaitingInput) {
          activityText = WAITING_INPUT_ACTIVITY_TEXT;
        } else if (isSub) {
          if (subHasPermission) {
            activityText = 'Needs approval';
          } else {
            const sub = subagentCharacters.find((s) => s.id === id);
            const rows = sub ? subagentTools[sub.parentAgentId]?.[sub.parentToolId] : undefined;
            const activeRow = rows ? [...rows].reverse().find((t) => !t.done) : undefined;
            activityText = activeRow?.status ?? (sub?.label || 'Subtask');
          }
        } else {
          activityText = getActivityText(
            id,
            agentTools,
            ch.isActive,
            ch.bubbleType,
            ch.waitingAwaitingInput ?? false,
          );
          if (ch.isTeamLead && ch.isActive && tools?.some((t) => !t.done) && allIds.length > 1) {
            activityText = 'Coordinating tasks';
          }
          if (!ch.isActive && ch.routineActivity && activityText === 'Waiting for tasks') {
            activityText = `${ch.routineIcon || '💻'} ${ch.routineActivity}`;
          }
        }

        // Determine dot color
        const hasPermission = subHasPermission || tools?.some((t) => t.permissionWait && !t.done);
        const isActive = ch.isActive;
        const hasWaiting = ch.bubbleType === 'waiting';

        let dotColor: string | null = null;
        if (hasPermission || hasWaiting) {
          dotColor = 'var(--color-status-permission)';
        } else if (isActive) {
          dotColor = 'var(--color-status-active)';
        }

        // Team info
        const teamRoleLabel = ch.isTeamLead ? 'LEAD' : ch.agentName || null;
        const hasExtraLines = !!(ch.folderName || teamRoleLabel);

        // Context gauge. Every agent gets one — lead, teammate, adopted,
        // headless — as soon as it has taken a turn. Sub-agents never do: they
        // have no session of their own, so contextTokens stays 0.
        const contextRatio = ch.contextTokens / ch.maxContextTokens;
        const showContextGauge = !isSub && ch.contextTokens > 0;

        return (
          <div
            key={id}
            className="absolute flex flex-col items-center -translate-x-1/2"
            style={{
              left: screenX,
              top: screenY - (hasExtraLines ? 34 : 28),
              pointerEvents: isSelected ? 'auto' : 'none',
              opacity: alwaysShowOverlay && !isSelected && !isHovered ? (isSub ? 0.5 : 0.75) : 1,
              zIndex: isSelected ? 42 : 41,
            }}
            data-testid="agent-overlay"
            data-agent-id={id}
          >
            {ch.speechBubbleText && (ch.speechBubbleTimer || 0) > 0 && (
              <div className="mb-2 px-3 py-1.5 bg-white/95 text-slate-900 border border-slate-700 font-semibold text-2xs rounded-lg shadow-xl animate-bounce max-w-[280px] text-center whitespace-normal break-words leading-tight pointer-events-none relative z-50">
                <span>{ch.speechBubbleText}</span>
                <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] border-t-white" />
              </div>
            )}
            <div className="flex items-center border-border px-8 pt-2 pb-4 gap-5 pixel-panel whitespace-nowrap max-w-2xs">
              {dotColor && (
                <span
                  className={`w-6 h-6 rounded-full shrink-0 ${isActive && !hasPermission && !hasWaiting ? 'pixel-pulse' : ''}`}
                  style={{ background: dotColor }}
                />
              )}
              <div className="flex flex-col gap-1 overflow-hidden">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span
                    className="overflow-hidden text-ellipsis block font-bold leading-none"
                    style={{
                      fontSize: '16px',
                      color: ch.isTeamLead ? TEAM_LEAD_COLOR : 'inherit',
                    }}
                  >
                    {ch.customName || teamRoleLabel || (isSub ? 'Subagent' : 'Agent')}
                  </span>
                  {(() => {
                    const r = getRoleDefinition(ch.role);
                    return (
                      <span
                        className="text-2xs px-2 py-0.5 rounded border leading-none shrink-0"
                        style={{
                          borderColor: r.badgeColor,
                          backgroundColor: r.badgeColor + '22',
                          color: r.badgeColor,
                          fontSize: '11px',
                        }}
                        title={r.description}
                      >
                        {r.icon} {r.name}
                      </span>
                    );
                  })()}
                </div>
                <span
                  className="overflow-hidden text-ellipsis block leading-tight font-medium"
                  style={{
                    fontSize: isSub ? '15px' : '17px',
                    fontStyle: isSub ? 'italic' : undefined,
                  }}
                >
                  {activityText}
                </span>
                {ch.currentOrder && (
                  <span
                    className="text-2xs leading-tight text-accent-bright overflow-hidden text-ellipsis block max-w-xs"
                    title={'Active order: ' + ch.currentOrder}
                  >
                    📋 {ch.delegatedFrom ? `${ch.delegatedFrom} ➔ ` : ''}
                    {ch.currentOrder}
                    {ch.orderStatus === 'running' ||
                    ch.orderStatus === 'reading' ||
                    ch.orderStatus === 'writing' ? (
                      <span className="text-yellow-400 font-mono ml-1">
                        (⚙️ {ch.orderProgressMessage || 'running'})
                      </span>
                    ) : null}
                  </span>
                )}
                {ch.folderName && (
                  <span className="text-2xs leading-none text-text-muted overflow-hidden text-ellipsis block">
                    {ch.folderName}
                  </span>
                )}
              </div>
              {isSelected && !isSub && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseAgent(id);
                  }}
                  title="Close agent"
                  className="ml-2 shrink-0 leading-none"
                >
                  ×
                </Button>
              )}
            </div>
            {showContextGauge && (
              <div
                style={{
                  width: CONTEXT_GAUGE_WIDTH_PX,
                  height: CONTEXT_GAUGE_HEIGHT_PX,
                  background: CONTEXT_GAUGE_BG,
                  marginTop: 2,
                }}
                title={`${Math.round(contextRatio * 100)}% context used (${(ch.contextTokens / 1000).toFixed(0)}k of ${(ch.maxContextTokens / 1000).toFixed(0)}k tokens)`}
                data-testid="context-gauge"
                data-context-pct={Math.round(contextRatio * 100)}
              >
                <div
                  style={{
                    width: `${Math.min(contextRatio * 100, 100)}%`,
                    height: '100%',
                    background: getFuelColor(contextRatio),
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
