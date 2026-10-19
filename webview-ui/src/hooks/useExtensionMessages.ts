import { useCallback, useEffect, useRef, useState } from 'react';

import type { HooksConsentRequest } from '../../../core/src/messages.js';
import { playDoneSound, playPermissionSound, setSoundEnabled } from '../notificationSound.js';
import type { ExistingAgentMeta, PendingAgent } from '../office/engine/existingAgents.js';
import { reconcileExistingAgents } from '../office/engine/existingAgents.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { setGhostHeadlessAgents as setRendererGhostHeadlessAgents } from '../office/engine/renderer.js';
import { setFloorSprites } from '../office/floorTiles.js';
import { buildDynamicCatalog } from '../office/layout/furnitureCatalog.js';
import { migrateLayoutColors } from '../office/layout/layoutSerializer.js';
import { setCarpetSprites } from '../office/sprites/carpetTiles.js';
import { setPetTemplates } from '../office/sprites/petSpriteData.js';
import { setCharacterTemplates } from '../office/sprites/spriteData.js';
import {
  extractToolName,
  isSubagentToolName,
  setProviderCapabilities,
} from '../office/toolUtils.js';
import type { OfficeLayout, ToolActivity } from '../office/types.js';
import { setWallSprites } from '../office/wallTiles.js';
import { isBrowserRuntime, isE2E } from '../runtime.js';
import { transport } from '../transport/index.js';

/**
 * A Headless agent is one the office adopted from outside (a CLI session, a session
 * picked up by Watch All Sessions) and therefore has no terminal to focus. Its
 * character renders translucent so it reads as untouchable at a glance.
 *
 * Standalone is exempt: that adapter has no terminals at all, so every agent
 * would qualify and the cue would distinguish nothing.
 */
const isHeadlessAgent = (isExternal: boolean | undefined): boolean =>
  isExternal === true && !isBrowserRuntime;

export interface SubagentCharacter {
  id: number;
  parentAgentId: number;
  parentToolId: string;
  label: string;
}

interface FurnitureAsset {
  id: string;
  name: string;
  label: string;
  category: string;
  file: string;
  width: number;
  height: number;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  canPlaceOnWalls: boolean;
  groupId?: string;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
  orientation?: string;
  state?: string;
  mirrorSide?: boolean;
  rotationScheme?: string;
  animationGroup?: string;
  frame?: number;
}

export interface WorkspaceFolder {
  name: string;
  path: string;
}

interface ExtensionMessageState {
  agents: number[];
  selectedAgent: number | null;
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  subagentCharacters: SubagentCharacter[];
  layoutReady: boolean;
  layoutWasReset: boolean;
  loadedAssets?: { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> };
  workspaceFolders: WorkspaceFolder[];
  /** Distinct folderNames seen across agents this session — source for the Areas folder dropdown. */
  agentFolderNames: string[];
  externalAssetDirectories: string[];
  lastSeenVersion: string;
  extensionVersion: string;
  watchAllSessions: boolean;
  setWatchAllSessions: (v: boolean) => void;
  alwaysShowLabels: boolean;
  ghostHeadlessAgents: boolean;
  setGhostHeadlessAgents: (v: boolean) => void;
  hooksEnabled: boolean;
  setHooksEnabled: (v: boolean) => void;
  /** Actual install state per provider (hooksStatus messages) — absent/false
   *  while first-run consent is pending, unlike hooksEnabled which defaults
   *  true. Keyed by providerId; today's Settings checkbox reads 'copilot'. */
  hooksInstalled: Record<string, boolean>;
  /** Bumped per provider on every hooksStatus message. `hooksInstalled` alone cannot say "the server answered": a
   *  failed install re-reports the `false` already held, so no effect runs. The Intro needs the ARRIVAL to tell a
   *  pending install from a failed one, per provider — A's status is never a verdict on B's install. */
  hooksStatusSeq: Record<string, number>;
  hooksInfoShown: boolean;
  /** First-run consent ask (hooksConsentRequest). Non-null while the server waits on an answer; carries the provider
   *  and the server's exact disclosure copy, so the consent step renders the terms being approved with no client
   *  duplicate to drift. Cleared on answer/dismissal, and by a matching provider's hooksStatus installed=true. */
  consentRequest: HooksConsentRequest | null;
  dismissConsentRequest: (providerId: string | null) => void;
  // Areas
  areaMappings: Record<string, string[]>;
  setAreaMappings: (m: Record<string, string[]>) => void;
  showAreas: boolean;
  setShowAreas: (v: boolean) => void;
}

function saveAgentSeats(os: OfficeState): void {
  transport.send({ type: 'saveAgentSeats', seats: os.getPersistableSeats() });
}

export function useExtensionMessages(
  getOfficeState: () => OfficeState,
  onLayoutLoaded?: (layout: OfficeLayout) => void,
  isEditDirty?: () => boolean,
): ExtensionMessageState {
  const [agents, setAgents] = useState<number[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [agentTools, setAgentTools] = useState<Record<number, ToolActivity[]>>({});
  const [agentStatuses, setAgentStatuses] = useState<Record<number, string>>({});
  const [subagentTools, setSubagentTools] = useState<
    Record<number, Record<string, ToolActivity[]>>
  >({});
  const [subagentCharacters, setSubagentCharacters] = useState<SubagentCharacter[]>([]);
  const [layoutReady, setLayoutReady] = useState(false);
  const [layoutWasReset, setLayoutWasReset] = useState(false);
  const [loadedAssets, setLoadedAssets] = useState<
    { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> } | undefined
  >();
  const [workspaceFolders, setWorkspaceFolders] = useState<WorkspaceFolder[]>([]);
  const [agentFolderNames, setAgentFolderNames] = useState<string[]>([]);
  const [externalAssetDirectories, setExternalAssetDirectories] = useState<string[]>([]);
  const [lastSeenVersion, setLastSeenVersion] = useState('');
  const [extensionVersion, setExtensionVersion] = useState('');
  const [watchAllSessions, setWatchAllSessions] = useState(false);
  const [alwaysShowLabels, setAlwaysShowLabels] = useState(false);
  const [ghostHeadlessAgents, setGhostHeadlessAgentsState] = useState(false);
  const [hooksEnabled, setHooksEnabled] = useState(true);
  const [hooksInstalled, setHooksInstalled] = useState<Record<string, boolean>>({});
  const [hooksStatusSeq, setHooksStatusSeq] = useState<Record<string, number>>({});
  const [hooksInfoShown, setHooksInfoShown] = useState(true);
  // FIFO of pending consent asks, at most one per provider (a re-ask replaces that provider's entry in place). The
  // HEAD is what the Intro renders; answering, dismissing, or mooting it advances to the next provider's ask rather
  // than dropping it — the server sends one request per provider on the same handshake.
  const [consentQueue, setConsentQueue] = useState<HooksConsentRequest[]>([]);
  const consentRequest = consentQueue[0] ?? null;
  const [areaMappings, setAreaMappings] = useState<Record<string, string[]>>({});
  const [showAreas, setShowAreas] = useState(false);

  // The renderer keeps its own module-level copy (read every rAF frame), so both
  // sources of truth move together — the persisted value on settingsLoaded and
  // the user's click in Settings.
  const applyGhostHeadlessAgents = useCallback((enabled: boolean) => {
    setGhostHeadlessAgentsState(enabled);
    setRendererGhostHeadlessAgents(enabled);
  }, []);

  // Track whether initial layout has been loaded (ref to avoid re-render)
  const layoutReadyRef = useRef(false);

  // Live background spawn tools per agent (runInBackground agentToolStart, or a
  // lazily-created watched sub). Their sub-characters outlive the parent's turn:
  // agentToolsClear must NOT remove them — despawning and re-creating moved the
  // character to a new tile every turn. Cleared by subagentClear/agentClosed.
  const backgroundParentToolIdsRef = useRef<Record<number, Set<string>>>({});

  useEffect(() => {
    // Buffer agents from existingAgents until layout is loaded
    let pendingAgents: PendingAgent[] = [];

    // Accumulate distinct folderNames seen across agents (never removed during the
    // session): the source for the Areas folder-mapping dropdown, so a folder stays
    // editable even after its agents close.
    const noteFolderName = (name?: string) => {
      if (!name) return;
      setAgentFolderNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (msg: any) => {
      const os = getOfficeState();
      // CI / e2e diagnostic: record every received transport message on the
      // window-side log. The fixture reads window.__copilotAgentsTestHooks.
      // messageLog and attaches as JSON so CI failures can see the exact
      // sequence of messages the webview actually processed. Gated on the e2e
      // harness flag so this unbounded log never grows in a real session.
      if (isE2E && typeof window !== 'undefined') {
        if (!window.__copilotAgentsTestHooks) window.__copilotAgentsTestHooks = {};
        if (!window.__copilotAgentsTestHooks.messageLog) {
          window.__copilotAgentsTestHooks.messageLog = [];
        }
        window.__copilotAgentsTestHooks.messageLog.push({
          at: Date.now(),
          type: msg.type,
          id: msg.id,
          toolName: msg.toolName,
          status: msg.status,
          toolId: msg.toolId,
          parentToolId: msg.parentToolId,
        });
      }

      if (msg.type === 'providerCapabilities') {
        setProviderCapabilities({
          readingTools: msg.readingTools,
          subagentToolNames: msg.subagentToolNames,
        });
        return;
      }

      if (msg.type === 'layoutLoaded') {
        // Skip external layout updates while editor has unsaved changes
        if (layoutReadyRef.current && isEditDirty?.()) {
          console.log('[Webview] Skipping external layout update — editor has unsaved changes');
          return;
        }
        const rawLayout = msg.layout as OfficeLayout | null;
        const layout = rawLayout && rawLayout.version === 1 ? migrateLayoutColors(rawLayout) : null;
        if (layout) {
          os.rebuildFromLayout(layout);
          onLayoutLoaded?.(layout);
        } else {
          // Default layout — snapshot whatever OfficeState built
          onLayoutLoaded?.(os.getLayout());
        }
        // Add buffered agents now that layout (and seats) are correct
        for (const p of pendingAgents) {
          os.addAgent(p.id, p.palette, p.hueShift, p.seatId, true, p.folderName);
          if (p.isHeadless) os.setHeadless(p.id, true);
        }
        pendingAgents = [];
        const restoredIds = os.restoreCopilotPixelAgents();
        if (restoredIds.length > 0) {
          setAgents((prev) => {
            const set = new Set(prev);
            const next = [...prev];
            for (const rId of restoredIds) {
              if (!set.has(rId)) {
                next.push(rId);
                set.add(rId);
              }
            }
            return next.sort((a, b) => a - b);
          });
        }
        for (const [chId, ch] of os.characters.entries()) {
          if (ch.isTeamLead) {
            const subIds = os.ensureSubagentTeam(chId, 5);
            setAgents([chId, ...subIds].sort((a, b) => a - b));
            break;
          }
        }
        layoutReadyRef.current = true;
        setLayoutReady(true);
        if (msg.wasReset) {
          setLayoutWasReset(true);
        }
        if (os.characters.size > 0) {
          saveAgentSeats(os);
        }
      } else if (msg.type === 'agentCreated') {
        const id = msg.id as number;
        const folderName = msg.folderName as string | undefined;
        const isTeammate = msg.isTeammate as boolean | undefined;
        const teammateName = msg.teammateName as string | undefined;
        const teammateParentId = msg.parentAgentId as number | undefined;
        const teamName = msg.teamName as string | undefined;
        setAgents((prev) => (prev.includes(id) ? prev : [...prev, id]));
        // Don't auto-select teammates (keep focus on lead)
        if (!isTeammate) {
          setSelectedAgent(id);
        }
        if (isTeammate && teammateParentId !== undefined) {
          // Teammate: inherit parent's palette and workspace folderName (teammate runs
          // in the same workspace as the lead). Name shown via agentName (teamRoleLabel).
          // Seat them at the free seat closest to the lead so the team clusters.
          const parentCh = os.characters.get(teammateParentId);
          const palette = parentCh ? parentCh.palette : undefined;
          const hueShift = parentCh ? parentCh.hueShift : undefined;
          os.addAgent(
            id,
            palette,
            hueShift,
            undefined,
            undefined,
            parentCh?.folderName,
            teammateParentId,
          );
          noteFolderName(parentCh?.folderName);
          // Set team metadata on the character
          const ch = os.characters.get(id);
          if (ch) {
            ch.leadAgentId = teammateParentId;
            ch.teamName = teamName ?? parentCh?.teamName;
            ch.agentName = teammateName;
            ch.isSubagent = true;
            ch.isTeamLead = false;
            ch.parentAgentId = teammateParentId;
            ch.spawnedByName = parentCh?.customName || 'Project Lead';
            if (ch.role === 'Lead') {
              ch.role = 'Teammate';
            }
            os.addTeamDialogue({
              fromAgentId: teammateParentId,
              fromName: parentCh?.customName || 'Project Lead',
              fromRole: 'Lead',
              toAgentId: id,
              toName: ch.customName || `Subagent #${id}`,
              toRole: ch.role || 'Teammate',
              text: `Spawning teammate @${ch.customName || 'Subagent'} to assist with workspace tasks.`,
              context: 'delegation',
            });
          }
        } else {
          const palette = msg.palette as number | undefined;
          const hueShift = msg.hueShift as number | undefined;
          os.addAgent(id, palette, hueShift, undefined, undefined, folderName);
          noteFolderName(folderName);
          const ch = os.characters.get(id);
          if (ch) {
            ch.isTeamLead = true;
            ch.role = 'Lead';
            ch.isSubagent = false;
            for (const [otherId, otherCh] of os.characters.entries()) {
              if (otherId !== id) {
                otherCh.isTeamLead = false;
                if (otherCh.role === 'Lead') {
                  otherCh.role = 'Teammate';
                }
              }
            }
            os.addTeamDialogue({
              fromAgentId: id,
              fromName: ch.customName || `Lead #${id}`,
              fromRole: 'Lead',
              text: 'Project Lead ready for chat directives.',
              context: 'chat',
            });
            const subIds = os.ensureSubagentTeam(id, 5);
            setAgents([id, ...subIds].sort((a, b) => a - b));
          }
          if (isHeadlessAgent(msg.isExternal as boolean | undefined)) {
            os.setHeadless(id, true);
          }
        }
        saveAgentSeats(os);
      } else if (msg.type === 'agentClosed') {
        const id = msg.id as number;
        const targetCh = os.characters.get(id);
        if (targetCh?.isCopilotPixelAgent) {
          // CopilotPixel agents never disappear when chat closes
          return;
        }
        setAgents((prev) => prev.filter((a) => a !== id));
        setSelectedAgent((prev) => (prev === id ? null : prev));
        setAgentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setAgentStatuses((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setSubagentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        // Remove all sub-agent characters belonging to this agent
        delete backgroundParentToolIdsRef.current[id];
        os.removeAllSubagents(id);
        setSubagentCharacters((prev) =>
          prev.filter((s) => {
            const subCh = os.characters.get(s.id);
            return s.parentAgentId !== id || subCh?.isCopilotPixelAgent;
          }),
        );
        os.removeAgent(id);
      } else if (msg.type === 'existingAgents') {
        const incoming = msg.agents as number[];
        const meta = (msg.agentMeta || {}) as Record<number, ExistingAgentMeta>;
        const folderNames = (msg.folderNames || {}) as Record<number, string>;
        const externalAgents = (msg.externalAgents || {}) as Record<number, boolean>;
        const headlessAgents: Record<number, boolean> = {};
        for (const id of incoming) {
          noteFolderName(folderNames[id]);
          if (isHeadlessAgent(externalAgents[id])) headlessAgents[id] = true;
        }
        // Order-independent restore: add agents now if the layout (and its seats)
        // is already built, otherwise buffer them for the next layoutLoaded.
        // Depending on layoutLoaded always arriving last stranded restored agents
        // on surfaces that send layout first (issue #334).
        if (
          reconcileExistingAgents(
            os,
            incoming,
            meta,
            folderNames,
            layoutReadyRef.current,
            pendingAgents,
            headlessAgents,
          )
        ) {
          saveAgentSeats(os);
        }
        setAgents((prev) => {
          const ids = new Set(prev);
          const merged = [...prev];
          for (const id of incoming) {
            if (!ids.has(id)) {
              merged.push(id);
            }
          }
          return merged.sort((a, b) => a - b);
        });
      } else if (msg.type === 'agentToolStart') {
        const id = msg.id as number;
        const toolId = msg.toolId as string;
        const status = msg.status as string;
        const permissionActive = msg.permissionActive as boolean | undefined;
        const toolName = (msg.toolName as string | undefined) ?? extractToolName(status);
        setAgentTools((prev) => {
          const list = prev[id] || [];
          const existing = list.find((t) => t.toolId === toolId);
          if (existing) {
            if (
              existing.status === status &&
              existing.permissionWait === (permissionActive || false) &&
              !existing.done &&
              existing.toolName === toolName
            ) {
              return prev;
            }
            return {
              ...prev,
              [id]: list.map((t) =>
                t.toolId === toolId
                  ? {
                      ...t,
                      status,
                      toolName,
                      done: false,
                      permissionWait: permissionActive || false,
                    }
                  : t,
              ),
            };
          }
          return {
            ...prev,
            [id]: [
              ...list,
              { toolId, toolName, status, done: false, permissionWait: permissionActive || false },
            ],
          };
        });
        os.setAgentTool(id, toolName);
        os.setAgentActive(id, true);
        // Don't clear the permission bubble if the hook already confirmed permission is needed
        if (!permissionActive) {
          os.clearPermissionBubble(id);
        }
        // Create sub-agent character for Task/Agent/subagent tools.
        // runInBackground routing:
        //   - tmux teammate path (onTeammateDetected) creates the teammate;
        //   - other subagents (Antigravity invoke_subagent/browser_subagent, Copilot Task/subagent)
        //     must create the sub-agent character in the office.
        const runInBackground = msg.runInBackground as boolean | undefined;
        if (runInBackground) {
          const set = (backgroundParentToolIdsRef.current[id] ??= new Set());
          set.add(toolId);
        }
        const isTeammateSpawn = msg.isTeammateSpawn as boolean | undefined;
        const parentChar = os.characters.get(id);
        const isTmuxTeam = !!(parentChar?.teamName && parentChar?.teamUsesTmux);
        // Update active agent speech bubble and state in-place (never spawn duplicate bubbles)
        const activeChar = os.characters.get(id);
        if (activeChar) {
          const displayLabel = status.startsWith('Subtask:')
            ? status.slice('Subtask:'.length).trim()
            : status;
          activeChar.speechBubbleText = displayLabel;
          activeChar.speechBubbleTimer = 5.0;
        }

        // ONLY delegate to a subagent character if this is an explicit subagent tool or teammate spawn!
        // Ordinary tools (run_command, view_file, grep_search, edit_file, etc.) are executed directly by the active agent
        // and update their status/bubble in-place.
        if (isSubagentToolName(toolName) && !isTeammateSpawn && (!runInBackground || !isTmuxTeam)) {
          const label = status.startsWith('Subtask:')
            ? status.slice('Subtask:'.length).trim()
            : status;
          const subId = os.addSubagent(id, toolId, toolName, label);
          setSubagentCharacters((prev) => {
            if (prev.some((s) => s.id === subId)) return prev;
            return [...prev, { id: subId, parentAgentId: id, parentToolId: toolId, label }];
          });
          const subCh = os.characters.get(subId);
          const leadCh = os.characters.get(id);
          if (subCh && leadCh) {
            subCh.isSubagent = true;
            subCh.leadAgentId = id;
            subCh.parentAgentId = id;
            subCh.spawnedByName = leadCh.customName || 'Project Lead';
            subCh.currentOrder = label;
            os.setAgentTool(subId, toolName);
            os.setAgentActive(subId, true);

            // Register tool under subId so AgentRosterModal and ToolOverlay show active status on the worker
            setAgentTools((prev) => {
              const list = prev[subId] || [];
              const existing = list.find((t) => t.toolId === toolId);
              if (existing) return prev;
              return {
                ...prev,
                [subId]: [
                  ...list,
                  {
                    toolId,
                    toolName,
                    status: label,
                    done: false,
                    permissionWait: permissionActive || false,
                  },
                ],
              };
            });

            os.addTeamDialogue({
              fromAgentId: id,
              fromName: leadCh.customName || 'Project Lead',
              fromRole: 'Lead',
              toAgentId: subId,
              toName: subCh.customName || `Worker #${subId}`,
              toRole: subCh.role || 'Teammate',
              text: `@${subCh.customName || 'Worker'} (${subCh.role}): Assigning ${toolName || 'task'} "${label}".`,
              context: 'delegation',
              aiAction: toolName || undefined,
            });
            os.addTeamDialogue({
              fromAgentId: subId,
              fromName: subCh.customName || `Worker #${subId}`,
              fromRole: subCh.role || 'Teammate',
              toAgentId: id,
              toName: leadCh.customName || 'Project Lead',
              toRole: 'Lead',
              text: `Understood, Lead! Ready as ${subCh.role} for "${label}".`,
              context: 'delegation',
            });
          }
        }
      } else if (msg.type === 'agentToolDone') {
        const id = msg.id as number;
        const toolId = msg.toolId as string;
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          const updated = list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t));
          const nextActive = [...updated].reverse().find((t) => !t.done);
          os.setAgentTool(
            id,
            nextActive ? (nextActive.toolName ?? extractToolName(nextActive.status)) : null,
          );
          const activeChar = os.characters.get(id);
          if (activeChar) {
            if (nextActive) {
              activeChar.speechBubbleText = nextActive.status;
              activeChar.speechBubbleTimer = 5.0;
            } else {
              activeChar.speechBubbleText = 'Completed task';
              activeChar.speechBubbleTimer = 2.5;
            }
          }
          return {
            ...prev,
            [id]: updated,
          };
        });

        // Check if a worker handled this tool and update worker status
        const subId = os.getSubagentId(id, toolId);
        if (subId !== null) {
          setSubagentCharacters((prev) => prev.filter((s) => s.parentToolId !== toolId));
          setAgentTools((prev) => {
            const list = prev[subId];
            if (!list) return prev;
            return {
              ...prev,
              [subId]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
            };
          });

          setSubagentTools((prev) => {
            const pTools = prev[id];
            if (!pTools) return prev;
            const rows = pTools[toolId];
            if (!rows) return prev;
            return {
              ...prev,
              [id]: {
                ...pTools,
                [toolId]: rows.map((r) => ({ ...r, done: true })),
              },
            };
          });

          const subCh = os.characters.get(subId);
          if (subCh) {
            os.setAgentTool(subId, null);
            os.setAgentActive(subId, false);
            subCh.currentOrder = null;
            subCh.role = 'Teammate';
            os.startAgentBreak(subId);
            os.addTeamDialogue({
              fromAgentId: subId,
              fromName: subCh.customName || `Worker #${subId}`,
              fromRole: 'Teammate',
              toAgentId: id,
              toName: os.characters.get(id)?.customName || 'Project Lead',
              toRole: 'Lead',
              text: `Completed ${subCh.currentOrder ? `"${subCh.currentOrder}"` : 'subtask'}. Returning to lounge for a break!`,
              context: 'break_room',
            });
          }
          os.subagentIdMap.delete(`${id}:${toolId}`);
        }
      } else if (msg.type === 'agentToolsClear') {
        const id = msg.id as number;
        const bgSet = backgroundParentToolIdsRef.current[id];
        setAgentTools((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        // Keep sub-tool rows of live background spawns: their sub-characters
        // survive the parent's turn end and stay animated by their own activity.
        setSubagentTools((prev) => {
          const agentSubs = prev[id];
          if (!agentSubs) return prev;
          const kept: Record<string, ToolActivity[]> = {};
          for (const [parentToolId, rows] of Object.entries(agentSubs)) {
            if (bgSet?.has(parentToolId)) kept[parentToolId] = rows;
          }
          const next = { ...prev };
          if (Object.keys(kept).length === 0) {
            delete next[id];
          } else {
            next[id] = kept;
          }
          return next;
        });
        // Remove this agent's sub-agent characters, EXCEPT:
        // - team leads with inline teammates: their sub-agents represent real
        //   teammates, removed only by SubagentStop/subagentClear;
        // - live background spawns: removing + re-creating them on every turn
        //   end teleported the character (subagentClear removes them for real).
        // Subagents remain in the office and head to the break room when turns conclude
        for (const [subId, meta] of os.subagentMeta.entries()) {
          if (meta.parentAgentId === id) {
            const subCh = os.characters.get(subId);
            if (subCh && !subCh.isTakingBreak) {
              subCh.role = 'Teammate';
              os.setAgentActive(subId, false);
              os.setAgentTool(subId, null);
              os.startAgentBreak(subId);
            }
          }
        }
        // Clean up completed subagents from subagentCharacters
        setSubagentCharacters((prev) =>
          prev.filter((s) => s.parentAgentId !== id || bgSet?.has(s.parentToolId)),
        );
        const clearActiveChar = os.characters.get(id);
        if (clearActiveChar) {
          clearActiveChar.speechBubbleText = null;
          clearActiveChar.speechBubbleTimer = 0;
        }
        os.setAgentTool(id, null);
        os.clearPermissionBubble(id);
      } else if (msg.type === 'agentSelected') {
        const id = msg.id as number;
        setSelectedAgent(id);
      } else if (msg.type === 'agentStatus') {
        const id = msg.id as number;
        const status = msg.status as string;
        setAgentStatuses((prev) => {
          if (status === 'active') {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          }
          return { ...prev, [id]: status };
        });
        os.setAgentActive(id, status === 'active');
        if (status === 'active') {
          // Model in chat reasoning / planning phase
          const leadCh = os.characters.get(id);
          if (leadCh) {
            leadCh.speechBubbleText = 'Thinking...';
            leadCh.speechBubbleTimer = 4.0;
            if (leadCh.isTeamLead) {
              os.startTeamReasoning(id);
            }
          }
        } else if (status === 'waiting') {
          os.showWaitingBubble(id, msg.awaitingInput === true);
          const ch = os.characters.get(id);
          if (ch) {
            ch.speechBubbleText = null;
            ch.speechBubbleTimer = 0;
          }
          playDoneSound();
          os.startAgentBreak(id);
          os.returnAllTeamWorkersToBreak(id);
        }
      } else if (msg.type === 'agentToolPermission') {
        const id = msg.id as number;
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          return {
            ...prev,
            [id]: list.map((t) => (t.done ? t : { ...t, permissionWait: true })),
          };
        });
        os.showPermissionBubble(id);
        playPermissionSound();
      } else if (msg.type === 'subagentToolPermission') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        // Show permission bubble on the sub-agent character
        const subId = os.getSubagentId(id, parentToolId);
        if (subId !== null) {
          os.showPermissionBubble(subId);
        }
      } else if (msg.type === 'agentToolPermissionClear') {
        const id = msg.id as number;
        setAgentTools((prev) => {
          const list = prev[id];
          if (!list) return prev;
          const hasPermission = list.some((t) => t.permissionWait);
          if (!hasPermission) return prev;
          return {
            ...prev,
            [id]: list.map((t) => (t.permissionWait ? { ...t, permissionWait: false } : t)),
          };
        });
        os.clearPermissionBubble(id);
        // Also clear permission bubbles on all sub-agent characters of this parent
        for (const [subId, meta] of os.subagentMeta) {
          if (meta.parentAgentId === id) {
            os.clearPermissionBubble(subId);
          }
        }
      } else if (msg.type === 'subagentToolStart') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        const toolId = msg.toolId as string;
        const status = msg.status as string;
        const subToolName = (msg.toolName as string | undefined) ?? extractToolName(status);
        setSubagentTools((prev) => {
          const agentSubs = prev[id] || {};
          const list = agentSubs[parentToolId] || [];
          const existing = list.find((t) => t.toolId === toolId);
          if (existing) {
            if (existing.status === status && !existing.done && existing.toolName === subToolName) {
              return prev;
            }
            return {
              ...prev,
              [id]: {
                ...agentSubs,
                [parentToolId]: list.map((t) =>
                  t.toolId === toolId ? { ...t, status, toolName: subToolName, done: false } : t,
                ),
              },
            };
          }
          return {
            ...prev,
            [id]: {
              ...agentSubs,
              [parentToolId]: [...list, { toolId, toolName: subToolName, status, done: false }],
            },
          };
        });
        // Update sub-agent character's tool and active state.
        let subId = os.getSubagentId(id, parentToolId);
        if (subId === null) {
          subId = os.addSubagent(id, parentToolId, subToolName, status);
          const newSubId = subId;
          setSubagentCharacters((prev) => {
            if (prev.some((s) => s.id === newSubId)) return prev;
            return [...prev, { id: newSubId, parentAgentId: id, parentToolId, label: '' }];
          });
          const set = (backgroundParentToolIdsRef.current[id] ??= new Set());
          set.add(parentToolId);
        }
        os.setAgentTool(subId, subToolName);
        os.setAgentActive(subId, true);
        const subCh = os.characters.get(subId);
        const leadCh = os.characters.get(id);
        if (subCh) {
          os.addTeamDialogue({
            fromAgentId: subId,
            fromName: subCh.customName || `Subagent #${subId}`,
            fromRole: subCh.role || 'Coder',
            toAgentId: id,
            toName: leadCh?.customName || 'Project Lead',
            toRole: 'Lead',
            text: `Running ${subToolName || 'tool'}: ${status}`,
            context: 'ai_progress',
            aiAction: subToolName || undefined,
          });
        }
      } else if (msg.type === 'subagentToolDone') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        const toolId = msg.toolId as string;
        setSubagentTools((prev) => {
          const agentSubs = prev[id];
          if (!agentSubs) return prev;
          const list = agentSubs[parentToolId];
          if (!list) return prev;
          const updated = list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t));
          const subId = os.getSubagentId(id, parentToolId);
          if (subId !== null) {
            const nextActive = [...updated].reverse().find((t) => !t.done);
            os.setAgentTool(
              subId,
              nextActive ? (nextActive.toolName ?? extractToolName(nextActive.status)) : null,
            );
          }
          return {
            ...prev,
            [id]: {
              ...agentSubs,
              [parentToolId]: updated,
            },
          };
        });
      } else if (msg.type === 'subagentClear') {
        const id = msg.id as number;
        const parentToolId = msg.parentToolId as string;
        backgroundParentToolIdsRef.current[id]?.delete(parentToolId);
        setSubagentTools((prev) => {
          const agentSubs = prev[id];
          if (!agentSubs || !(parentToolId in agentSubs)) return prev;
          const next = { ...agentSubs };
          delete next[parentToolId];
          if (Object.keys(next).length === 0) {
            const outer = { ...prev };
            delete outer[id];
            return outer;
          }
          return { ...prev, [id]: next };
        });
        const subId = os.getSubagentId(id, parentToolId);
        const subCh = subId !== null ? os.characters.get(subId) : null;
        const leadCh = os.characters.get(id);
        if (subCh) {
          const completedRole = subCh.role || 'Teammate';
          os.addTeamDialogue({
            fromAgentId: subCh.id,
            fromName: subCh.customName || `Worker #${subCh.id}`,
            fromRole: completedRole,
            toAgentId: id,
            toName: leadCh?.customName || 'Project Lead',
            toRole: 'Lead',
            text: `Subtask completed as ${completedRole}! Handing results back to Lead.`,
            context: 'completion',
          });
          if (leadCh) {
            os.addTeamDialogue({
              fromAgentId: leadCh.id,
              fromName: leadCh.customName || 'Project Lead',
              fromRole: 'Lead',
              toAgentId: subCh.id,
              toName: subCh.customName || `Worker #${subCh.id}`,
              toRole: completedRole,
              text: `Great work @${subCh.customName || 'Worker'}! Head to the lounge for a break ☕.`,
              context: 'completion',
            });
          }
          // Workers reset to Teammate while taking a break in the lounge
          subCh.role = 'Teammate';
          os.setAgentActive(subCh.id, false);
          os.setAgentTool(subCh.id, null);
          os.startAgentBreak(subCh.id);
        }
      } else if (msg.type === 'characterSpritesLoaded') {
        const characters = msg.characters as Array<{
          down: string[][][];
          up: string[][][];
          right: string[][][];
        }>;
        console.log(`[Webview] Received ${characters.length} pre-colored character sprites`);
        setCharacterTemplates(characters);
      } else if (msg.type === 'petSpritesLoaded') {
        const pets = msg.pets;
        if (!Array.isArray(pets)) {
          return;
        }
        const petNames = Array.isArray(msg.petNames) ? (msg.petNames as string[]) : undefined;
        console.log(`[Webview] Received ${pets.length} pet sprites`);
        setPetTemplates(
          pets as Array<{
            walkDown: string[][][];
            idleDown: string[][][];
            walkUp: string[][][];
            idleUp: string[][][];
            walkRight: string[][][];
          }>,
          petNames,
        );
      } else if (msg.type === 'floorTilesLoaded') {
        const sprites = msg.sprites as string[][][];
        console.log(`[Webview] Received ${sprites.length} floor tile patterns`);
        setFloorSprites(sprites);
      } else if (msg.type === 'wallTilesLoaded') {
        const sets = msg.sets as string[][][][];
        console.log(`[Webview] Received ${sets.length} wall tile set(s)`);
        setWallSprites(sets);
      } else if (msg.type === 'carpetTilesLoaded') {
        const sets = msg.sets as string[][][][];
        console.log(`[Webview] Received ${sets.length} carpet variant(s)`);
        setCarpetSprites(sets);
      } else if (msg.type === 'areaMappingsLoaded') {
        const mappings = (msg.mappings ?? {}) as Record<string, string[]>;
        setAreaMappings(mappings);
        os.setAreaMappings(mappings);
      } else if (msg.type === 'workspaceFolders') {
        const folders = msg.folders as WorkspaceFolder[];
        setWorkspaceFolders(folders);
      } else if (msg.type === 'agentTeamDialogue') {
        const os = getOfficeState();
        os.addTeamDialogue({
          fromAgentId: msg.fromAgentId,
          fromName: msg.fromName,
          fromRole: msg.fromRole,
          toAgentId: msg.toAgentId,
          toName: msg.toName,
          toRole: msg.toRole,
          text: msg.text,
          context: msg.context as
            'delegation' | 'ai_progress' | 'completion' | 'break_room' | 'chat',
          aiAction: msg.aiAction,
        });
      } else if (msg.type === 'agentOrderProgress') {
        const id = msg.agentId;
        const os = getOfficeState();
        os.setAgentOrderProgress(
          id,
          msg.status,
          msg.message,
          typeof msg.modelName === 'string' ? msg.modelName : undefined,
        );

        if (msg.status === 'delegating' && msg.delegation) {
          const toRole = msg.delegation.toRole;
          const subTask = msg.delegation.task;
          const target =
            Array.from(os.characters.values()).find((c) => c.role === toRole && c.id !== id) ||
            Array.from(os.characters.values()).find((c) => c.id !== id);
          if (target) {
            os.delegateOrder(id, target.id, subTask);
            transport.send({
              type: 'executeAgentOrder',
              agentId: target.id,
              order: subTask,
              role: target.role,
              agentName: target.customName,
              delegatedFrom: os.characters.get(id)?.customName || `Agent #${id}`,
            });
          }
        } else if (msg.status === 'spawning' && msg.delegation) {
          const spawnRole = msg.delegation.spawnedRole || 'Coder';
          const spawnName = msg.delegation.spawnedName;
          const subTask = msg.delegation.task;
          const newSubId = os.spawnSubagentWithRole(id, spawnRole, spawnName, subTask);
          setAgents((prev) => (prev.includes(newSubId) ? prev : [...prev, newSubId]));
          transport.send({
            type: 'executeAgentOrder',
            agentId: newSubId,
            order: subTask,
            role: spawnRole,
            agentName: spawnName,
            delegatedFrom: os.characters.get(id)?.customName || `Lead #${id}`,
          });
        }
      } else if (msg.type === 'settingsLoaded') {
        const soundOn = msg.soundEnabled as boolean;
        setSoundEnabled(soundOn);
        if (typeof msg.watchAllSessions === 'boolean') {
          setWatchAllSessions(msg.watchAllSessions as boolean);
        }
        if (typeof msg.alwaysShowLabels === 'boolean') {
          setAlwaysShowLabels(msg.alwaysShowLabels as boolean);
        }
        if (typeof msg.ghostHeadlessAgents === 'boolean') {
          applyGhostHeadlessAgents(msg.ghostHeadlessAgents as boolean);
        }
        if (typeof msg.hooksEnabled === 'boolean') {
          setHooksEnabled(msg.hooksEnabled as boolean);
        }
        if (typeof msg.hooksInfoShown === 'boolean') {
          setHooksInfoShown(msg.hooksInfoShown as boolean);
        }
        if (typeof msg.showAreas === 'boolean') {
          setShowAreas(msg.showAreas as boolean);
        }
        if (Array.isArray(msg.externalAssetDirectories)) {
          setExternalAssetDirectories(msg.externalAssetDirectories as string[]);
        }
        if (typeof msg.lastSeenVersion === 'string') {
          setLastSeenVersion(msg.lastSeenVersion as string);
        }
        if (typeof msg.extensionVersion === 'string') {
          setExtensionVersion(msg.extensionVersion as string);
        }
      } else if (msg.type === 'hooksStatus') {
        if (typeof msg.installed === 'boolean' && typeof msg.providerId === 'string') {
          const providerId = msg.providerId as string;
          const installed = msg.installed as boolean;
          setHooksInstalled((m) => ({ ...m, [providerId]: installed }));
          setHooksStatusSeq((m) => ({ ...m, [providerId]: (m[providerId] ?? 0) + 1 }));
          if (installed) {
            // Moot once THIS provider's hooks are installed — the Settings toggle or another tab granted consent
            // while the dialog was open. Drop it from the queue (head or queued) rather than let a stale approval
            // re-install; another provider's status is not about this ask.
            setConsentQueue((q) => q.filter((r) => r.providerId !== providerId));
          }
        }
      } else if (msg.type === 'hooksConsentRequest') {
        if (
          typeof msg.providerId === 'string' &&
          typeof msg.headline === 'string' &&
          typeof msg.disclosure === 'string'
        ) {
          const request: HooksConsentRequest = {
            type: 'hooksConsentRequest',
            providerId: msg.providerId as string,
            headline: msg.headline as string,
            disclosure: msg.disclosure as string,
          };
          setConsentQueue((q) => {
            const i = q.findIndex((r) => r.providerId === request.providerId);
            if (i === -1) return [...q, request];
            const next = q.slice();
            next[i] = request; // a re-ask carries the freshest copy
            return next;
          });
        }
      } else if (msg.type === 'externalAssetDirectoriesUpdated') {
        if (Array.isArray(msg.dirs)) {
          setExternalAssetDirectories(msg.dirs as string[]);
        }
      } else if (msg.type === 'furnitureAssetsLoaded') {
        try {
          const catalog = msg.catalog as FurnitureAsset[];
          const sprites = msg.sprites as Record<string, string[][]>;
          console.log(`📦 Webview: Loaded ${catalog.length} furniture assets`);
          // Build dynamic catalog immediately so getCatalogEntry() works when layoutLoaded arrives next
          buildDynamicCatalog({ catalog, sprites });
          setLoadedAssets({ catalog, sprites });
        } catch (err) {
          console.error(`❌ Webview: Error processing furnitureAssetsLoaded:`, err);
        }
      } else if (msg.type === 'agentTeamInfo') {
        const id = msg.id as number;
        os.setTeamInfo(
          id,
          msg.teamName as string | undefined,
          msg.agentName as string | undefined,
          msg.isTeamLead as boolean | undefined,
          msg.leadAgentId as number | undefined,
          msg.teamUsesTmux as boolean | undefined,
        );
        os.sanitizeTeamHierarchy();
      } else if (msg.type === 'agentContextUsage') {
        const id = msg.id as number;
        os.setAgentContext(id, msg.contextTokens as number, msg.maxContextTokens as number);
      }
    };
    const unsubscribe = transport.onMessage(handler);
    transport.send({ type: 'webviewReady' });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getOfficeState]);

  // Idle sub-agent characters between their turns: when every tracked tool row
  // for a sub is done, stop its typing animation (a later subagentToolStart
  // reactivates it). Watched background sub-agents get a synthesized done for
  // each live tool at their turn end, so they sit idle instead of typing forever.
  useEffect(() => {
    const os = getOfficeState();
    for (const sub of subagentCharacters) {
      const rows = subagentTools[sub.parentAgentId]?.[sub.parentToolId];
      if (rows && rows.length > 0 && rows.every((t) => t.done)) {
        os.setAgentTool(sub.id, null);
        os.setAgentActive(sub.id, false);
      }
    }
  }, [subagentTools, subagentCharacters, getOfficeState]);

  return {
    agents,
    selectedAgent,
    agentTools,
    agentStatuses,
    subagentTools,
    subagentCharacters,
    layoutReady,
    layoutWasReset,
    loadedAssets,
    workspaceFolders,
    agentFolderNames,
    externalAssetDirectories,
    lastSeenVersion,
    extensionVersion,
    watchAllSessions,
    setWatchAllSessions,
    alwaysShowLabels,
    ghostHeadlessAgents,
    setGhostHeadlessAgents: applyGhostHeadlessAgents,
    hooksEnabled,
    hooksInstalled,
    hooksStatusSeq,
    setHooksEnabled,
    hooksInfoShown,
    consentRequest,
    // Called when a tour ends (answer + Let's Go, the X, Escape) with the providerId that tour was ABOUT, removing
    // that entry so the next provider's ask becomes the head. Keyed by id, not a blind shift: an answered ask's own
    // installed:true moot may already have removed the head, and a shift would then drop the NEXT provider's ask
    // unanswered. An aborted ask returns on the next connect; the queue never re-adds it here.
    dismissConsentRequest: useCallback(
      (providerId: string | null) =>
        setConsentQueue((q) =>
          providerId === null ? q.slice(1) : q.filter((r) => r.providerId !== providerId),
        ),
      [],
    ),
    areaMappings,
    setAreaMappings,
    showAreas,
    setShowAreas,
  };
}
