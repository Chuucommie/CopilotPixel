import { useEffect, useState } from 'react';

import type { ModelPreference } from '../../../core/src/messages.js';
import {
  AGENT_STATUS_ACTIVE_DOT_COLOR,
  AGENT_STATUS_IDLE_DOT_COLOR,
  AGENT_STATUS_RUNNING_DOT_COLOR,
  COPILOT_PIXEL_BADGE_BG,
  COPILOT_PIXEL_BADGE_BORDER,
  COPILOT_PIXEL_BADGE_TEXT,
} from '../constants.js';
import { getAllRoles, getRandomEnglishName, getRoleDefinition } from '../office/agentRoles.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
import { transport } from '../transport/index.js';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

interface AgentRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  officeState: OfficeState;
  agentTools: Record<number, ToolActivity[]>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  onFocusAgent?: (agentId: number) => void;
}

export function AgentRosterModal({
  isOpen,
  onClose,
  officeState,
  agentTools,
  subagentTools,
  onFocusAgent,
}: AgentRosterModalProps) {
  const [, setRefreshKey] = useState(0);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);

  // Form states for orders & delegation
  const [orderInput, setOrderInput] = useState('');
  const [modelPreference, setModelPreference] = useState<ModelPreference>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('copilotpixel_model_preference');
      if (saved === 'cheapest' || saved === 'copilot' || saved === 'gemini') {
        return saved;
      }
    }
    return 'cheapest';
  });
  const [delegateTargetId, setDelegateTargetId] = useState<number | null>(null);
  const [delegateInput, setDelegateInput] = useState('');
  const [spawnRole, setSpawnRole] = useState('Coder');
  const [spawnTask, setSpawnTask] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const triggerRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    return transport.onMessage((msg) => {
      if (msg.type === 'agentOrderProgress') {
        triggerRefresh();
      }
    });
  }, []);

  if (!isOpen) return null;

  const characters = Array.from(officeState.characters.values()).sort((a, b) => {
    if (a.isTeamLead) return -1;
    if (b.isTeamLead) return 1;
    return a.id - b.id;
  });

  const activeChar = characters.find((c) => c.id === selectedAgentId) || characters[0] || null;
  const roles = getAllRoles();

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleNameChange = (agentId: number, newName: string) => {
    if (!newName.trim()) return;
    officeState.setAgentName(agentId, newName.trim());
    triggerRefresh();
  };

  const handleRandomizeName = (agentId: number) => {
    const existingNames = characters.map((c) => c.customName || '').filter(Boolean);
    const randomName = getRandomEnglishName(existingNames);
    officeState.setAgentName(agentId, randomName);
    triggerRefresh();
    showFeedback(`Assigned random name: ${randomName}`);
  };

  const handleRoleChange = (agentId: number, newRole: string) => {
    officeState.setAgentRole(agentId, newRole);
    triggerRefresh();
    showFeedback(`Role updated to ${newRole}`);
  };

  const handleSendOrder = () => {
    if (!activeChar || !orderInput.trim()) return;
    const order = orderInput.trim();
    officeState.setAgentOrder(activeChar.id, order);
    officeState.setAgentOrderProgress(
      activeChar.id,
      'running',
      'Starting autonomous background execution...',
    );

    transport.send({
      type: 'executeAgentOrder',
      agentId: activeChar.id,
      order,
      role: activeChar.role || 'Coder',
      agentName: activeChar.customName || `Agent #${activeChar.id}`,
      modelPreference,
    });

    showFeedback(
      `Directive assigned to ${activeChar.customName || 'Agent'} with background AI (${modelPreference})!`,
    );
    setOrderInput('');
    triggerRefresh();
  };

  const handleCancelOrder = (agentId: number) => {
    officeState.setAgentOrderProgress(agentId, 'cancelled', 'Order cancelled by user.');
    transport.send({
      type: 'cancelAgentOrder',
      agentId,
    });
    showFeedback('Order execution cancelled.');
    triggerRefresh();
  };

  const handleClearOrder = (agentId: number) => {
    officeState.clearAgentOrder(agentId);
    showFeedback('Order cleared');
    triggerRefresh();
  };

  const handleDelegateOrder = () => {
    if (!activeChar || delegateTargetId === null || !delegateInput.trim()) return;
    const targetChar = officeState.characters.get(delegateTargetId);
    if (!targetChar) return;
    const order = delegateInput.trim();

    officeState.delegateOrder(activeChar.id, delegateTargetId, order);
    officeState.setAgentOrderProgress(
      delegateTargetId,
      'running',
      `Delegated from ${activeChar.customName || 'Lead'}`,
    );

    transport.send({
      type: 'executeAgentOrder',
      agentId: delegateTargetId,
      order,
      role: targetChar.role || 'Coder',
      agentName: targetChar.customName || `Agent #${delegateTargetId}`,
      delegatedFrom: activeChar.customName || `Agent #${activeChar.id}`,
      modelPreference,
    });

    showFeedback(`Delegated from ${activeChar.customName} to ${targetChar.customName}: "${order}"`);
    setDelegateInput('');
    triggerRefresh();
  };

  const handleSpawnHelper = () => {
    if (!activeChar) return;
    const task = spawnTask.trim();
    const subId = officeState.spawnSubagentWithRole(
      activeChar.id,
      spawnRole,
      undefined,
      task || undefined,
    );
    const subChar = officeState.characters.get(subId);

    if (task) {
      officeState.setAgentOrderProgress(subId, 'running', 'Starting spawned task...');
      transport.send({
        type: 'executeAgentOrder',
        agentId: subId,
        order: task,
        role: spawnRole,
        agentName: subChar?.customName || `Agent #${subId}`,
        delegatedFrom: activeChar.customName || `Agent #${activeChar.id}`,
        modelPreference,
      });
    }

    showFeedback(
      `Spawned new ${spawnRole} helper: ${subChar?.customName || 'Subagent'} (ID: ${subId})!`,
    );
    setSpawnTask('');
    setSelectedAgentId(subId);
    triggerRefresh();
  };

  // Derive current action status for an agent
  const getAgentStatusText = (ch: (typeof characters)[0]): string => {
    if (ch.isSubagent) {
      const parentTools = subagentTools[ch.parentAgentId ?? 0];
      if (parentTools) {
        for (const list of Object.values(parentTools)) {
          const active = [...list].reverse().find((t) => !t.done);
          if (active) return active.status;
        }
      }
      return ch.isActive ? 'Working on subtask' : 'Idle';
    }

    const tools = agentTools[ch.id];
    if (tools && tools.length > 0) {
      const active = [...tools].reverse().find((t) => !t.done);
      if (active) return active.status;
    }
    if (ch.bubbleType === 'waiting') return 'Waiting for input';
    if (ch.bubbleType === 'permission') return 'Permission required';
    if (ch.bubbleType === 'done') return 'Completed step';
    return ch.isActive ? 'Active' : 'Idle';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Agent Roster & Directives"
      className="max-w-4xl"
    >
      <div className="flex flex-col gap-4">
        {/* Feedback alert */}
        {feedbackMsg && (
          <div className="bg-accent/20 border border-accent/50 text-accent-bright px-3 py-1.5 rounded text-xs flex items-center justify-between">
            <span>{feedbackMsg}</span>
            <button
              onClick={() => setFeedbackMsg(null)}
              className="text-text-muted hover:text-text text-sm ml-2"
            >
              ×
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Left Column: Agent List */}
          <div className="pixel-panel p-2 flex flex-col gap-1.5 max-h-[65vh] overflow-y-auto">
            <div className="text-2xs font-bold uppercase tracking-wider text-text-muted px-2 py-1">
              Active Agents ({characters.length})
            </div>

            {characters.length === 0 ? (
              <div className="text-xs text-text-muted p-4 italic text-center">
                No agents in office. Start an AI session or spawn an agent.
              </div>
            ) : (
              characters.map((ch) => {
                const isSelected = activeChar?.id === ch.id;
                const roleDef = getRoleDefinition(ch.role);
                const status = getAgentStatusText(ch);
                const isRunningOrder =
                  ch.orderStatus === 'running' ||
                  ch.orderStatus === 'reading' ||
                  ch.orderStatus === 'writing';

                return (
                  <div
                    key={ch.id}
                    onClick={() => setSelectedAgentId(ch.id)}
                    className={`p-2.5 rounded cursor-pointer transition-all border flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-accent/20 border-accent shadow-sm'
                        : 'bg-black/20 hover:bg-black/30 border-transparent hover:border-border/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{
                            backgroundColor: isRunningOrder
                              ? AGENT_STATUS_RUNNING_DOT_COLOR
                              : ch.isActive
                                ? AGENT_STATUS_ACTIVE_DOT_COLOR
                                : AGENT_STATUS_IDLE_DOT_COLOR,
                          }}
                        />
                        <span className="font-bold text-xs truncate text-text">
                          {ch.customName || `Agent #${ch.id}`}
                        </span>
                        {ch.isSubagent && (
                          <span className="text-2xs px-1.5 py-0.5 rounded bg-white/10 text-text-muted">
                            sub
                          </span>
                        )}
                        {ch.isCopilotPixelAgent && (
                          <span
                            className="text-2xs px-1.5 py-0.5 rounded border font-semibold flex items-center gap-0.5 shrink-0"
                            style={{
                              backgroundColor: COPILOT_PIXEL_BADGE_BG,
                              borderColor: COPILOT_PIXEL_BADGE_BORDER,
                              color: COPILOT_PIXEL_BADGE_TEXT,
                            }}
                            title="Persistent CopilotPixel Background Agent"
                          >
                            👾 CPX
                          </span>
                        )}
                      </div>
                      <span
                        className="text-2xs px-2 py-0.5 rounded border shrink-0 font-medium"
                        style={{
                          borderColor: roleDef.badgeColor,
                          backgroundColor: `${roleDef.badgeColor}22`,
                          color: roleDef.badgeColor,
                        }}
                      >
                        {roleDef.icon} {roleDef.name}
                      </span>
                    </div>

                    <div className="text-2xs text-text-muted truncate flex items-center gap-1">
                      <span>{status}</span>
                      {ch.isTakingBreak && (
                        <span className="text-accent-bright font-semibold">
                          • ☕ Break ({ch.breakType || 'relax'})
                        </span>
                      )}
                    </div>

                    {isRunningOrder ? (
                      <div className="text-2xs text-yellow-400 truncate font-medium flex items-center gap-1">
                        <span>⚙️</span>
                        <span>{ch.orderProgressMessage || ch.currentOrder}</span>
                      </div>
                    ) : ch.currentOrder ? (
                      <div className="text-2xs text-accent-bright truncate font-medium">
                        📋 {ch.currentOrder}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          {/* Right Two Columns: Detail & Control Panel */}
          {activeChar ? (
            <div className="md:col-span-2 flex flex-col gap-4 overflow-y-auto max-h-[65vh] pr-2">
              {/* Agent Overview & Rename Header */}
              <div className="pixel-panel p-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getRoleDefinition(activeChar.role).icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={activeChar.customName || ''}
                          onChange={(e) => handleNameChange(activeChar.id, e.target.value)}
                          className="bg-bg border border-border px-2 py-1 text-sm font-bold rounded text-text focus:border-accent outline-none"
                          placeholder="Agent Name"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRandomizeName(activeChar.id)}
                          title="Generate random English name from pool"
                        >
                          🎲 Random
                        </Button>
                        {onFocusAgent && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              onFocusAgent(activeChar.id);
                              onClose();
                            }}
                            title="Focus this agent terminal or chat"
                          >
                            🔍 Focus
                          </Button>
                        )}
                      </div>
                      <div className="text-2xs text-text-muted mt-1">
                        ID: {activeChar.id} • Seat: {activeChar.seatId || 'Roaming'}
                      </div>
                    </div>
                  </div>

                  {/* Role Selector */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-text-muted font-bold">Role:</label>
                    <select
                      value={activeChar.role || 'Coder'}
                      onChange={(e) => handleRoleChange(activeChar.id, e.target.value)}
                      className="bg-bg border border-border px-2 py-1 text-sm font-semibold rounded text-text focus:border-accent outline-none cursor-pointer"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.icon} {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-xs text-text-muted bg-black/20 p-2 rounded flex items-center justify-between gap-2">
                  <span>{getRoleDefinition(activeChar.role).description}</span>
                  {activeChar.isCopilotPixelAgent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:bg-danger/20 shrink-0"
                      onClick={() => {
                        officeState.despawnCopilotPixelAgent(activeChar.id);
                        showFeedback('Agent dismissed from office.');
                        setSelectedAgentId(null);
                      }}
                      title="Permanently remove this background agent from CopilotPixel"
                    >
                      🗑️ Dismiss
                    </Button>
                  )}
                </div>
              </div>

              {/* Break Routine Controls */}
              <div className="flex items-center justify-between p-2.5 rounded bg-black/20 border border-border">
                <div className="flex items-center gap-2">
                  <span className="text-sm">☕</span>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-text">Break Activity</span>
                    <span className="text-2xs text-text-muted">
                      {activeChar.isTakingBreak
                        ? `Currently taking a break: ${activeChar.breakType || 'relaxing'} in the common area`
                        : 'Agent is at their desk working or ready for tasks'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {activeChar.isTakingBreak ? (
                    <Button
                      variant="accent"
                      size="sm"
                      onClick={() => {
                        officeState.returnAgentFromBreak(activeChar.id);
                        showFeedback('Agent called back to desk!');
                      }}
                      title="Call agent back to their desk"
                    >
                      💼 Resume Work
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          officeState.startAgentBreak(activeChar.id, 'coffee');
                          showFeedback('Agent sent on Coffee Break!');
                        }}
                        title="Send to Coffee Machine"
                      >
                        ☕ Coffee
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          officeState.startAgentBreak(activeChar.id, 'snack');
                          showFeedback('Agent sent for a Snack!');
                        }}
                        title="Send to Snack Corner"
                      >
                        🍩 Snack
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          officeState.startAgentBreak(activeChar.id, 'steamdeck');
                          showFeedback('Agent sent to play Steam Deck on sofa!');
                        }}
                        title="Send to Sofa with Steam Deck"
                      >
                        🎮 Steam Deck
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Direct Order Form & Autonomous AI */}
              <div className="pixel-panel p-4 flex flex-col gap-3">
                <div className="font-bold text-sm text-accent-bright flex items-center justify-between">
                  <span>Direct Order / Autonomous Task</span>
                  {activeChar.currentOrder && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleClearOrder(activeChar.id)}
                    >
                      Clear Active Order
                    </Button>
                  )}
                </div>

                {/* Model Preference Selection */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-black/20 p-2 rounded text-xs">
                  <span className="text-text-muted font-bold">Background AI Model:</span>
                  <select
                    value={modelPreference}
                    onChange={(e) => setModelPreference(e.target.value as ModelPreference)}
                    className="bg-bg border border-border px-2 py-1 rounded text-text focus:border-accent outline-none text-xs"
                  >
                    <option value="cheapest">
                      ⚡ Auto: Lowest Cost / Fast (gpt-4o-mini / gemini-flash)
                    </option>
                    <option value="copilot">🐙 GitHub Copilot: Economy (gpt-4o-mini / luna)</option>
                    <option value="gemini">✨ Google Gemini: Fast (gemini-flash)</option>
                  </select>
                </div>

                {activeChar.currentOrder ? (
                  <div className="p-3 bg-accent/10 border border-accent/40 rounded text-sm flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-semibold text-accent-bright">Active Directive:</span>{' '}
                        <span>{activeChar.currentOrder}</span>
                        {activeChar.delegatedFrom && (
                          <div className="text-2xs text-text-muted mt-0.5">
                            Delegated by: {activeChar.delegatedFrom}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Live Execution Status */}
                    {activeChar.orderStatus === 'running' ||
                    activeChar.orderStatus === 'reading' ||
                    activeChar.orderStatus === 'writing' ? (
                      <div className="flex items-center justify-between p-2.5 bg-yellow-500/10 border border-yellow-500/40 rounded text-xs mt-1">
                        <div className="flex items-center gap-2">
                          <span className="animate-spin text-sm">⚙️</span>
                          <div>
                            <div className="font-bold text-yellow-300">
                              Running on workspace ({activeChar.orderModelName || 'Background AI'})
                            </div>
                            <div className="text-text-muted mt-0.5">
                              {activeChar.orderProgressMessage || 'Analyzing workspace...'}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          className="text-red-400 hover:text-red-300 border border-red-500/40 hover:border-red-400"
                          size="sm"
                          onClick={() => handleCancelOrder(activeChar.id)}
                        >
                          Stop / Cancel
                        </Button>
                      </div>
                    ) : activeChar.orderStatus === 'completed' ? (
                      <div className="p-2.5 bg-green-500/10 border border-green-500/40 rounded text-xs flex flex-col gap-1 mt-1">
                        <div className="font-bold text-green-400 flex items-center gap-1.5">
                          <span>✅</span> Completed{' '}
                          {activeChar.orderModelName ? `via ${activeChar.orderModelName}` : ''}
                        </div>
                        <div className="text-text whitespace-pre-wrap max-h-36 overflow-y-auto font-mono text-2xs bg-black/30 p-2 rounded">
                          {activeChar.orderProgressMessage}
                        </div>
                      </div>
                    ) : activeChar.orderStatus === 'cancelled' ? (
                      <div className="p-2 bg-white/5 border border-white/20 rounded text-2xs text-text-muted italic mt-1">
                        ⏹️ Autonomous execution cancelled.
                      </div>
                    ) : activeChar.orderStatus === 'error' ? (
                      <div className="p-2 bg-red-500/10 border border-red-500/40 rounded text-2xs text-red-300 mt-1">
                        ❌ {activeChar.orderProgressMessage}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-xs text-text-muted italic">
                    No active direct order. Enter an instruction below to guide this agent with
                    background AI.
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={orderInput}
                    onChange={(e) => setOrderInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendOrder()}
                    placeholder="Enter directive (e.g. Audit authentication middleware, Run unit tests)..."
                    className="flex-1 bg-bg border border-border px-3 py-1.5 text-sm rounded text-text focus:border-accent outline-none"
                  />
                  <Button variant="accent" onClick={handleSendOrder} disabled={!orderInput.trim()}>
                    Issue Order
                  </Button>
                </div>
              </div>

              {/* Delegation & Subagent Spawning */}
              <div className="pixel-panel p-4 flex flex-col gap-4">
                <div className="font-bold text-sm text-text-muted uppercase tracking-wider">
                  Delegation & Team Actions
                </div>

                {/* Subaction A: Delegate to teammate */}
                <div className="flex flex-col gap-2 p-3 bg-white/5 rounded border border-border/50">
                  <span className="text-xs font-bold text-text">
                    Delegate Task to Another Agent
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={delegateTargetId ?? ''}
                      onChange={(e) =>
                        setDelegateTargetId(e.target.value ? Number(e.target.value) : null)
                      }
                      className="bg-bg border border-border px-2 py-1 text-sm rounded text-text focus:border-accent outline-none"
                    >
                      <option value="">Select Teammate...</option>
                      {characters
                        .filter((c) => c.id !== activeChar.id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.customName || `Agent #${c.id}`} ({c.role || 'Coder'})
                          </option>
                        ))}
                    </select>
                    <input
                      type="text"
                      value={delegateInput}
                      onChange={(e) => setDelegateInput(e.target.value)}
                      placeholder="Task for teammate..."
                      className="flex-1 min-w-[180px] bg-bg border border-border px-2 py-1 text-sm rounded text-text focus:border-accent outline-none"
                    />
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleDelegateOrder}
                      disabled={delegateTargetId === null || !delegateInput.trim()}
                    >
                      Delegate
                    </Button>
                  </div>
                </div>

                {/* Subaction B: Spawn helper subagent */}
                <div className="flex flex-col gap-2 p-3 bg-white/5 rounded border border-border/50">
                  <span className="text-xs font-bold text-text">Spawn Helper Subagent</span>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={spawnRole}
                      onChange={(e) => setSpawnRole(e.target.value)}
                      className="bg-bg border border-border px-2 py-1 text-sm rounded text-text focus:border-accent outline-none"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.icon} {r.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={spawnTask}
                      onChange={(e) => setSpawnTask(e.target.value)}
                      placeholder="Subtask goal (e.g. Inspect dependencies)..."
                      className="flex-1 min-w-[180px] bg-bg border border-border px-2 py-1 text-sm rounded text-text focus:border-accent outline-none"
                    />
                    <Button variant="accent" size="sm" onClick={handleSpawnHelper}>
                      + Spawn Helper
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="md:col-span-2 flex items-center justify-center p-8 text-text-muted italic">
              Select an agent from the list to view details and issue orders.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
