import { useEffect, useRef, useState } from 'react';

import { AGENT_STATUS_ACTIVE_DOT_COLOR, AGENT_STATUS_IDLE_DOT_COLOR } from '../constants.js';
import { getAllRoles, getRandomEnglishName, getRoleDefinition } from '../office/agentRoles.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { getCharacterSprites } from '../office/sprites/spriteData.js';
import type { Character, ToolActivity } from '../office/types.js';
import { Direction as Dir } from '../office/types.js';
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

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function AgentAvatar({
  palette,
  hueShift = 0,
  scale = 2,
  className = '',
}: {
  palette: number;
  hueShift?: number;
  scale?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const charSprites = getCharacterSprites(palette, hueShift);
    const sprite = charSprites.walk[Dir.DOWN][0];
    if (!sprite || sprite.length === 0) return;

    for (let r = 0; r < sprite.length; r++) {
      for (let c = 0; c < sprite[r].length; c++) {
        const color = sprite[r][c];
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(c * scale, r * scale, scale, scale);
        }
      }
    }
  }, [palette, hueShift, scale]);

  return (
    <canvas
      ref={canvasRef}
      width={16 * scale}
      height={32 * scale}
      className={`pixelated shrink-0 ${className}`}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function AgentRosterModal({
  isOpen,
  onClose,
  officeState,
  agentTools,
  subagentTools,
  onFocusAgent,
}: AgentRosterModalProps) {
  const [, setTick] = useState(0);
  const [activeTab, setActiveTab] = useState<'roster' | 'dialogue'>('roster');
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [dialogueFilter, setDialogueFilter] = useState<'all' | 'selected'>('all');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Periodic refresh for live timers and dialogue
  useEffect(() => {
    if (!isOpen) return;
    officeState.sanitizeTeamHierarchy();
    const interval = setInterval(() => {
      setTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, officeState]);

  // Auto-scroll chat to bottom when new dialogue arrives
  useEffect(() => {
    if (activeTab === 'dialogue') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTab, officeState.teamDialogue.length]);

  if (!isOpen) return null;

  const characters = Array.from(officeState.characters.values());
  // Strictly ONE Project Lead per team / office:
  const leadAgent =
    characters.find((c) => c.isTeamLead && !c.isSubagent) ||
    characters.find((c) => c.isTeamLead) ||
    characters.find((c) => !c.isSubagent) ||
    characters[0] ||
    null;
  const subagents = characters.filter(
    (c) => c !== leadAgent && (c.isSubagent || c.leadAgentId === leadAgent?.id),
  );
  const otherAgents = characters.filter((c) => c !== leadAgent && !subagents.includes(c));

  // Default selection to lead or first agent
  const activeChar =
    characters.find((c) => c.id === selectedAgentId) || leadAgent || characters[0] || null;
  const roles = getAllRoles();

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleNameChange = (agentId: number, newName: string) => {
    if (!newName.trim()) return;
    officeState.setAgentName(agentId, newName.trim());
    setTick((n) => n + 1);
  };

  const handleRandomizeName = (agentId: number) => {
    const existingNames = characters.map((c) => c.customName || '').filter(Boolean);
    const randomName = getRandomEnglishName(existingNames);
    officeState.setAgentName(agentId, randomName);
    setTick((n) => n + 1);
    showFeedback(`Assigned random name: ${randomName}`);
  };

  const handleRoleChange = (agentId: number, newRole: string) => {
    officeState.setAgentRole(agentId, newRole);
    setTick((n) => n + 1);
    showFeedback(`Role updated to ${newRole}`);
  };

  const getToolsForAgent = (ch: Character): ToolActivity[] => {
    const directTools = agentTools[ch.id];
    if (directTools && directTools.length > 0) return directTools;
    if (ch.isSubagent) {
      const meta = officeState.subagentMeta.get(ch.id);
      const parentId = meta?.parentAgentId ?? ch.parentAgentId ?? ch.leadAgentId;
      if (parentId !== null && parentId !== undefined && subagentTools[parentId]) {
        if (meta?.parentToolId && subagentTools[parentId][meta.parentToolId]) {
          return subagentTools[parentId][meta.parentToolId];
        }
        const allLists = Object.values(subagentTools[parentId]);
        if (allLists.length > 0) {
          return allLists.flat();
        }
      }
    }
    return [];
  };

  const getAgentStatusText = (ch: Character): string => {
    if (ch.isTakingBreak) {
      return `☕ Break (${ch.breakType || 'relax'} • ${formatDuration(ch.breakDuration || 0)})`;
    }
    if (ch.isSubagent) {
      const parentTools = subagentTools[ch.parentAgentId ?? 0];
      if (parentTools) {
        for (const list of Object.values(parentTools)) {
          const active = [...list].reverse().find((t) => !t.done);
          if (active) return active.status;
        }
      }
      return ch.isActive ? 'Executing subtask...' : 'Subtask finished';
    }

    const tools = getToolsForAgent(ch);
    if (tools && tools.length > 0) {
      const active = [...tools].reverse().find((t) => !t.done);
      if (active) return active.status;
    }
    if (ch.bubbleType === 'waiting') return 'Waiting for input from chat';
    if (ch.bubbleType === 'permission') return 'Needs approval';
    if (ch.bubbleType === 'done') return 'Completed turn';
    return ch.isActive ? 'Active (Thinking)' : 'Idle';
  };

  // Filter dialogue
  const filteredDialogue =
    dialogueFilter === 'all'
      ? officeState.teamDialogue
      : officeState.teamDialogue.filter(
          (m) => m.fromAgentId === activeChar?.id || m.toAgentId === activeChar?.id,
        );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Agent Roster & Live Chat Monitor"
      className="max-w-4xl"
    >
      <div className="flex flex-col gap-3">
        {/* Top Navigation & Mode Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
          <div className="flex items-center gap-1.5 bg-black/30 p-1 rounded-lg border border-border/40">
            <button
              onClick={() => setActiveTab('roster')}
              className={`px-3 py-1.5 text-xs font-bold rounded flex items-center gap-1.5 transition-colors ${
                activeTab === 'roster'
                  ? 'bg-accent text-accent-contrast shadow'
                  : 'text-text-muted hover:text-text hover:bg-white/5'
              }`}
            >
              <span>👥 Team Hierarchy & Status</span>
              <span className="px-1.5 py-0.5 rounded-full text-2xs bg-black/40">
                {characters.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('dialogue')}
              className={`px-3 py-1.5 text-xs font-bold rounded flex items-center gap-1.5 transition-colors ${
                activeTab === 'dialogue'
                  ? 'bg-accent text-accent-contrast shadow'
                  : 'text-text-muted hover:text-text hover:bg-white/5'
              }`}
            >
              <span>💬 Live Team Dialogue</span>
              <span className="px-1.5 py-0.5 rounded-full text-2xs bg-black/40 font-mono">
                {officeState.teamDialogue.length}
              </span>
            </button>
          </div>

          <div className="text-2xs text-text-muted italic flex items-center gap-1">
            <span>🏢 Pixel Office — Live Team Hierarchy & Comms</span>
          </div>
        </div>

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
          {/* Left Column: Team Hierarchy List */}
          <div className="pixel-panel p-2 flex flex-col gap-1.5 max-h-[65vh] overflow-y-auto">
            <div className="text-2xs font-bold uppercase tracking-wider text-text-muted px-2 py-1 flex items-center justify-between">
              <span>Active Agents</span>
              <span className="text-accent-bright">{characters.length} in office</span>
            </div>

            {characters.length === 0 ? (
              <div className="text-xs text-text-muted p-4 italic text-center">
                No active agents. Start a chat in GitHub Copilot or Google Antigravity to spawn the
                Project Lead!
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {/* 1. Lead Agent Section */}
                {leadAgent && (
                  <div className="flex flex-col gap-1">
                    <div
                      onClick={() => setSelectedAgentId(leadAgent.id)}
                      className={`p-2.5 rounded border transition-all cursor-pointer flex flex-col gap-1 ${
                        activeChar?.id === leadAgent.id
                          ? 'border-amber-400/80 bg-amber-500/15 shadow-sm'
                          : 'border-amber-500/30 bg-amber-500/5 hover:border-amber-400/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 truncate">
                          <AgentAvatar
                            palette={leadAgent.palette}
                            hueShift={leadAgent.hueShift || 0}
                            scale={1}
                            className="mr-0.5"
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: leadAgent.isActive
                                ? AGENT_STATUS_ACTIVE_DOT_COLOR
                                : AGENT_STATUS_IDLE_DOT_COLOR,
                            }}
                          />
                          <span className="font-bold text-xs truncate text-amber-300">
                            {leadAgent.customName || `Lead #${leadAgent.id}`}
                          </span>
                        </div>
                        <span className="text-2xs px-2 py-0.5 rounded border shrink-0 font-bold border-amber-400 bg-amber-400/20 text-amber-300">
                          👑 Project Lead
                        </span>
                      </div>
                      <div className="text-2xs text-text-muted truncate">
                        {getAgentStatusText(leadAgent)}
                      </div>
                    </div>

                    {/* Subagents spawned under this Lead */}
                    {subagents.map((sub) => {
                      const isSelected = activeChar?.id === sub.id;
                      const subDisplayRole = sub.role === 'Lead' ? 'Teammate' : sub.role;
                      const roleDef = getRoleDefinition(subDisplayRole);
                      return (
                        <div
                          key={sub.id}
                          onClick={() => setSelectedAgentId(sub.id)}
                          className={`ml-3 pl-2 border-l-2 py-2 pr-2 rounded-r transition-all cursor-pointer flex flex-col gap-1 ${
                            isSelected
                              ? 'border-l-accent border-y border-r border-accent/60 bg-accent/15'
                              : 'border-l-border/60 border-y border-r border-border/20 bg-black/20 hover:border-border/60'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="text-text-muted text-2xs font-mono">↳</span>
                              <AgentAvatar
                                palette={sub.palette}
                                hueShift={sub.hueShift || 0}
                                scale={1}
                                className="mr-0.5"
                              />
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{
                                  backgroundColor: sub.isActive
                                    ? AGENT_STATUS_ACTIVE_DOT_COLOR
                                    : AGENT_STATUS_IDLE_DOT_COLOR,
                                }}
                              />
                              <span className="font-bold text-xs truncate text-text">
                                {sub.customName || `Subagent #${sub.id}`}
                              </span>
                            </div>
                            <span
                              className="text-2xs px-1.5 py-0.5 rounded border shrink-0 font-medium"
                              style={{
                                borderColor: roleDef.badgeColor,
                                backgroundColor: `${roleDef.badgeColor}22`,
                                color: roleDef.badgeColor,
                              }}
                            >
                              {roleDef.icon} {roleDef.name}
                            </span>
                          </div>
                          <div className="text-2xs text-text-muted truncate pl-3">
                            {sub.currentOrder
                              ? `Task: ${sub.currentOrder}`
                              : getAgentStatusText(sub)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 2. Other / Roaming agents if any */}
                {otherAgents.map((ch) => {
                  const isSelected = activeChar?.id === ch.id;
                  const isLead = ch.isTeamLead && ch.id === leadAgent?.id;
                  const displayRole = isLead ? 'Lead' : ch.role === 'Lead' ? 'Teammate' : ch.role;
                  const roleDef = getRoleDefinition(displayRole);
                  return (
                    <div
                      key={ch.id}
                      onClick={() => setSelectedAgentId(ch.id)}
                      className={`p-2 rounded border transition-all cursor-pointer flex flex-col gap-1 ${
                        isSelected
                          ? 'border-accent bg-accent/20'
                          : 'border-border/40 bg-black/10 hover:border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 truncate">
                          <AgentAvatar
                            palette={ch.palette}
                            hueShift={ch.hueShift || 0}
                            scale={1}
                            className="mr-0.5"
                          />
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{
                              backgroundColor: ch.isActive
                                ? AGENT_STATUS_ACTIVE_DOT_COLOR
                                : AGENT_STATUS_IDLE_DOT_COLOR,
                            }}
                          />
                          <span className="font-bold text-xs truncate text-text">
                            {ch.customName || `Agent #${ch.id}`}
                          </span>
                        </div>
                        <span
                          className="text-2xs px-1.5 py-0.5 rounded border shrink-0 font-medium"
                          style={{
                            borderColor: roleDef.badgeColor,
                            backgroundColor: `${roleDef.badgeColor}22`,
                            color: roleDef.badgeColor,
                          }}
                        >
                          {roleDef.icon} {roleDef.name}
                        </span>
                      </div>
                      <div className="text-2xs text-text-muted truncate">
                        {getAgentStatusText(ch)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Two Columns: Tab Content */}
          <div className="md:col-span-2 flex flex-col gap-3 overflow-y-auto max-h-[65vh] pr-1">
            {activeTab === 'roster' ? (
              characters.length === 0 ? (
                <div className="pixel-panel p-6 flex flex-col items-center justify-center gap-3 text-center text-text-muted my-auto">
                  <span className="text-4xl">🏢</span>
                  <div className="text-sm font-bold text-text">No Agents Active Yet</div>
                  <div className="text-xs max-w-md leading-relaxed">
                    Start a conversation with <strong>GitHub Copilot Chat</strong> or launch an
                    autonomous task with <strong>Google Antigravity</strong> to spawn your Project
                    Lead and watch your team collaborate in real time!
                  </div>
                </div>
              ) : activeChar ? (
                <div className="flex flex-col gap-3">
                  {/* Agent Header & Hierarchy Card */}
                  <div className="pixel-panel p-4 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <div className="p-1 bg-black/30 border border-border/40 rounded flex items-center justify-center">
                            <AgentAvatar
                              palette={activeChar.palette}
                              hueShift={activeChar.hueShift || 0}
                              scale={2}
                            />
                          </div>
                          <span
                            className="text-2xl"
                            title={getRoleDefinition(activeChar.role).name}
                          >
                            {getRoleDefinition(activeChar.role).icon}
                          </span>
                        </div>
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
                          <div className="text-2xs text-text-muted mt-1 flex items-center gap-2">
                            <span>ID: {activeChar.id}</span>
                            <span>•</span>
                            <span>
                              Seat:{' '}
                              {activeChar.seatId ? `Desk ${activeChar.seatId}` : 'Roaming / Lounge'}
                            </span>
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
                          {(activeChar.id === leadAgent?.id || activeChar.isTeamLead
                            ? roles
                            : roles.filter((r) => r.id !== 'Lead')
                          ).map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.icon} {r.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Hierarchy Banner */}
                    <div className="text-xs p-2.5 rounded bg-black/30 border border-border/50 flex items-center justify-between gap-2">
                      {activeChar.isTeamLead && activeChar.id === leadAgent?.id ? (
                        <span className="text-amber-300 font-medium">
                          👑 <strong>Project Lead</strong> — Created directly by your chat session.
                          Spawns and coordinates subagents when performing complex tasks.
                        </span>
                      ) : (
                        <span className="text-text font-medium">
                          ↳ <strong>Subagent</strong> — Spawned by{' '}
                          <strong>
                            {activeChar.spawnedByName || leadAgent?.customName || 'Project Lead'}
                          </strong>{' '}
                          to execute directives.
                        </span>
                      )}
                      {activeChar.isCopilotPixelAgent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:bg-danger/20 shrink-0"
                          onClick={() => {
                            officeState.despawnCopilotPixelAgent(activeChar.id);
                            showFeedback('Agent removed from office.');
                            setSelectedAgentId(null);
                          }}
                          title="Remove agent from office"
                        >
                          🗑️ Dismiss
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Status & Live AI Activity */}
                  <div className="pixel-panel p-4 flex flex-col gap-3">
                    <div className="font-bold text-sm text-accent-bright flex items-center justify-between">
                      <span>Live AI Activity & Status</span>
                      <span className="text-2xs text-text-muted font-normal">
                        Updated from chat in real-time
                      </span>
                    </div>

                    {/* Active State Card */}
                    <div className="p-3 bg-white/5 border border-border rounded flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-text">Current State:</span>
                        <span className="text-xs font-semibold text-accent-bright">
                          {getAgentStatusText(activeChar)}
                        </span>
                      </div>

                      {/* Break Room Status */}
                      {activeChar.isTakingBreak ? (
                        <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded text-xs flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">☕</span>
                            <div>
                              <div className="font-bold text-amber-300">
                                Taking a Break in the Lounge ({activeChar.breakType || 'coffee'})
                              </div>
                              <div className="text-text-muted text-2xs mt-0.5">
                                Relaxing after completing tasks. Returns to desk automatically when
                                new work arrives from chat.
                              </div>
                            </div>
                          </div>
                          <span className="font-mono text-xs font-bold text-amber-400">
                            {formatDuration(activeChar.breakDuration || 0)}
                          </span>
                        </div>
                      ) : (
                        <div className="p-2 bg-black/20 rounded text-2xs text-text-muted flex items-center gap-1.5">
                          <span>💼</span>
                          <span>
                            At assigned desk, working on workspace code or ready for chat
                            instructions.
                          </span>
                        </div>
                      )}

                      {/* Active Tools */}
                      {getToolsForAgent(activeChar).length > 0 && (
                        <div className="mt-1 flex flex-col gap-1.5">
                          <span className="text-2xs font-bold uppercase tracking-wider text-text-muted">
                            Active Tools:
                          </span>
                          <div className="flex flex-col gap-1">
                            {getToolsForAgent(activeChar).map((t, idx) => (
                              <div
                                key={idx}
                                className={`text-2xs px-2 py-1 rounded border flex items-center justify-between ${
                                  t.done
                                    ? 'bg-black/20 border-border/40 text-text-muted'
                                    : 'bg-accent/15 border-accent/50 text-accent-bright font-bold'
                                }`}
                              >
                                <span>{t.status}</span>
                                <span>{t.done ? '✓ Done' : '⚙️ Running'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Informational note: Purely visual */}
                    <div className="p-2.5 bg-accent/10 border border-accent/30 rounded text-2xs text-text-muted flex items-center gap-2">
                      <span className="text-base">ℹ️</span>
                      <span>
                        <strong>Purely visual monitor:</strong> All agent decisions, subagent
                        creations, and tasks are guided directly by your chat with GitHub Copilot or
                        Google Antigravity.
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center p-8 text-text-muted italic">
                  Select an agent from the roster to inspect details.
                </div>
              )
            ) : (
              /* Live Dialogue Tab */
              <div className="pixel-panel p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <div className="font-bold text-sm text-accent-bright flex items-center gap-2">
                    <span>💬 Live Team Dialogue & AI Comms</span>
                    <span className="text-2xs px-2 py-0.5 rounded bg-black/30 font-mono text-text">
                      {filteredDialogue.length} messages
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDialogueFilter('all')}
                      className={`text-2xs px-2 py-1 rounded transition-colors ${
                        dialogueFilter === 'all'
                          ? 'bg-accent text-accent-contrast font-bold'
                          : 'text-text-muted hover:text-text'
                      }`}
                    >
                      All Dialogue
                    </button>
                    {activeChar && (
                      <button
                        onClick={() => setDialogueFilter('selected')}
                        className={`text-2xs px-2 py-1 rounded transition-colors ${
                          dialogueFilter === 'selected'
                            ? 'bg-accent text-accent-contrast font-bold'
                            : 'text-text-muted hover:text-text'
                        }`}
                      >
                        @{activeChar.customName || 'Selected'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Messages Stream */}
                <div className="flex flex-col gap-2.5 max-h-[48vh] overflow-y-auto pr-1">
                  {filteredDialogue.length === 0 ? (
                    <div className="text-xs text-text-muted p-6 italic text-center">
                      No dialogue recorded yet. Chat with Copilot or Antigravity to see the Lead and
                      subagents communicate in real-time as they read files, write code, and relax
                      in the lounge!
                    </div>
                  ) : (
                    filteredDialogue.map((msg) => {
                      const isFromLead = msg.fromRole === 'Lead';
                      const isBreak = msg.context === 'break_room';
                      return (
                        <div
                          key={msg.id}
                          className={`p-2.5 rounded-lg border text-xs flex flex-col gap-1 transition-all ${
                            isBreak
                              ? 'bg-amber-500/10 border-amber-500/30'
                              : isFromLead
                                ? 'bg-accent/10 border-accent/40'
                                : 'bg-black/30 border-border/60'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-2xs">
                            <div className="flex items-center gap-1.5 font-bold">
                              <span
                                className={isFromLead ? 'text-amber-300' : 'text-accent-bright'}
                              >
                                {isFromLead ? '👑' : '🤖'} {msg.fromName} ({msg.fromRole})
                              </span>
                              {msg.toName && (
                                <span className="text-text-muted font-normal">➜ @{msg.toName}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-text-muted font-mono">
                              {msg.aiAction && (
                                <span className="px-1.5 py-0.5 rounded bg-white/10 text-2xs font-sans">
                                  {msg.aiAction}
                                </span>
                              )}
                              <span>{formatTime(msg.timestamp)}</span>
                            </div>
                          </div>
                          <div className="text-text pl-1 whitespace-pre-wrap leading-relaxed font-sans">
                            {msg.text}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
