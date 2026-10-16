import { useState } from 'react';

import { AGENT_STATUS_ACTIVE_DOT_COLOR, AGENT_STATUS_IDLE_DOT_COLOR } from '../constants.js';
import { getAllRoles, getRandomEnglishName, getRoleDefinition } from '../office/agentRoles.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
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
  const [delegateTargetId, setDelegateTargetId] = useState<number | null>(null);
  const [delegateInput, setDelegateInput] = useState('');
  const [spawnRole, setSpawnRole] = useState('Coder');
  const [spawnTask, setSpawnTask] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const characters = Array.from(officeState.characters.values()).sort((a, b) => {
    if (a.isTeamLead) return -1;
    if (b.isTeamLead) return 1;
    return a.id - b.id;
  });

  const activeChar = characters.find((c) => c.id === selectedAgentId) || characters[0] || null;

  const roles = getAllRoles();

  const triggerRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3000);
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
    officeState.setAgentOrder(activeChar.id, orderInput.trim());
    showFeedback(`Order sent to ${activeChar.customName || 'Agent'}: "${orderInput.trim()}"`);
    setOrderInput('');
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

    officeState.delegateOrder(activeChar.id, delegateTargetId, delegateInput.trim());
    showFeedback(
      `Delegated from ${activeChar.customName} to ${targetChar.customName}: "${delegateInput.trim()}"`,
    );
    setDelegateInput('');
    triggerRefresh();
  };

  const handleSpawnHelper = () => {
    if (!activeChar) return;
    const subId = officeState.spawnSubagentWithRole(
      activeChar.id,
      spawnRole,
      undefined,
      spawnTask.trim() || undefined,
    );
    const subChar = officeState.characters.get(subId);
    showFeedback(
      `Spawned new ${spawnRole} helper: ${subChar?.customName || 'Subagent'} (ID: ${subId})!`,
    );
    setSpawnTask('');
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
    return ch.isActive ? 'Thinking...' : 'Idle at desk';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Agent Roster & Team Directives"
      zIndex={55}
      className="max-w-4xl w-full"
    >
      <div className="flex flex-col gap-4 text-text max-h-[80vh] overflow-hidden">
        {feedbackMsg && (
          <div className="bg-accent/20 border border-accent text-accent-bright px-8 py-4 text-sm font-semibold rounded">
            ✓ {feedbackMsg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 overflow-hidden">
          {/* Left Column: Agent List */}
          <div className="flex flex-col gap-2 overflow-y-auto max-h-[65vh] pr-2 border-r border-border">
            <div className="text-sm font-bold text-text-muted uppercase tracking-wider mb-2">
              Office Agents ({characters.length})
            </div>
            {characters.length === 0 ? (
              <div className="text-text-muted text-sm italic py-4">
                No agents currently in office
              </div>
            ) : (
              characters.map((ch) => {
                const roleDef = getRoleDefinition(ch.role);
                const isSelected = activeChar?.id === ch.id;
                const status = getAgentStatusText(ch);

                return (
                  <div
                    key={ch.id}
                    onClick={() => {
                      setSelectedAgentId(ch.id);
                      onFocusAgent?.(ch.id);
                    }}
                    className={`p-3 rounded border cursor-pointer transition-colors flex flex-col gap-1 ${
                      isSelected
                        ? 'border-accent bg-accent/15'
                        : 'border-border/60 hover:border-border hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            background: ch.isActive
                              ? AGENT_STATUS_ACTIVE_DOT_COLOR
                              : AGENT_STATUS_IDLE_DOT_COLOR,
                          }}
                        />
                        <span className="font-bold text-base truncate">
                          {ch.customName || `Agent #${ch.id}`}
                        </span>
                        {ch.isSubagent && (
                          <span className="text-2xs px-1.5 py-0.5 rounded bg-white/10 text-text-muted">
                            sub
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

                    <div className="text-2xs text-text-muted truncate">{status}</div>

                    {ch.currentOrder && (
                      <div className="text-2xs text-accent-bright truncate font-medium">
                        📋 {ch.currentOrder}
                      </div>
                    )}
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
                          className="bg-bg border border-border px-2 py-1 text-base font-bold text-text rounded focus:border-accent outline-none"
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

                <div className="text-xs text-text-muted bg-black/20 p-2 rounded">
                  {getRoleDefinition(activeChar.role).description}
                </div>
              </div>

              {/* Direct Order Form */}
              <div className="pixel-panel p-4 flex flex-col gap-3">
                <div className="font-bold text-sm text-accent-bright flex items-center justify-between">
                  <span>Direct Order / Task</span>
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

                {activeChar.currentOrder ? (
                  <div className="p-3 bg-accent/10 border border-accent/40 rounded text-sm flex items-start justify-between gap-2">
                    <div>
                      <span className="font-semibold text-accent-bright">Active Directive:</span>{' '}
                      <span>{activeChar.currentOrder}</span>
                      {activeChar.delegatedFrom && (
                        <div className="text-2xs text-text-muted mt-1">
                          Delegated by: {activeChar.delegatedFrom}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-text-muted italic">
                    No active direct order. Enter an instruction below to guide this agent.
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
