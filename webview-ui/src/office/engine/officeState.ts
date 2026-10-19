import { pickDiversePalette } from '../../../../core/src/paletteUtils.js';
import {
  AUTO_ON_FACING_DEPTH,
  AUTO_ON_SIDE_DEPTH,
  CHARACTER_HIT_HALF_WIDTH,
  CHARACTER_HIT_HEIGHT,
  CHARACTER_SITTING_OFFSET_PX,
  DISMISS_BUBBLE_FAST_FADE_SEC,
  FURNITURE_ANIM_INTERVAL_SEC,
  GREETER_ID,
  GREETER_TILE_MARGIN,
  INACTIVE_SEAT_TIMER_MIN_SEC,
  INACTIVE_SEAT_TIMER_RANGE_SEC,
  MAX_PET_ID_LENGTH,
  PET_HIT_HALF_WIDTH,
  PET_HIT_HEIGHT,
  WAITING_BUBBLE_DURATION_SEC,
} from '../../constants.js';
import { getAgentProfile, updateAgentProfile } from '../agentRoles.js';
import { getAnimationFrames, getCatalogEntry, getOnStateType } from '../layout/furnitureCatalog.js';
import {
  createDefaultLayout,
  getBlockedTiles,
  layoutToFurnitureInstances,
  layoutToSeats,
  layoutToTileMap,
} from '../layout/layoutSerializer.js';
import { findPath, getWalkableTiles, isWalkable } from '../layout/tileMap.js';
import { getPetCount, getPetName } from '../sprites/petSpriteData.js';
import { getLoadedCharacterCount } from '../sprites/spriteData.js';
import type {
  Character,
  FurnitureInstance,
  OfficeLayout,
  Pet,
  PlacedFurniture,
  PlacedPet,
  Seat,
  TileType as TileTypeVal,
} from '../types.js';
import {
  CharacterState,
  Direction,
  PetState,
  type TeamDialogueMessage,
  TILE_SIZE,
} from '../types.js';
import {
  getRandomBreakDialogue,
  getRandomSoloThought,
  inferWorkerRole,
  type UsefulWorkerRole,
  WORKER_NAMES,
} from './breakRoomChatter.js';
import { createCharacter, updateCharacter } from './characters.js';
import {
  loadCopilotPixelAgents,
  loadTeamDialogue,
  removeCopilotPixelAgent,
  saveOrUpdateCopilotPixelAgent,
  saveTeamDialogue,
} from './copilotPixelStore.js';
import { advanceMatrixEffect, startMatrixEffect } from './matrixEffectState.js';
import { createPet, updatePet } from './petEntity.js';
import { RadiantRoutineEngine } from './routineManager.js';
import { anchorTile, closestFreeSeat } from './seatPlacement.js';

/** Internal helper: facing-tile coords for a seat. Returns null for invalid direction. */
function seatFacingOffset(direction: Direction): { dCol: number; dRow: number } {
  if (direction === Direction.RIGHT) return { dCol: 1, dRow: 0 };
  if (direction === Direction.LEFT) return { dCol: -1, dRow: 0 };
  if (direction === Direction.DOWN) return { dCol: 0, dRow: 1 };
  return { dCol: 0, dRow: -1 };
}

export class OfficeState {
  routineEngine: RadiantRoutineEngine = new RadiantRoutineEngine();
  teamDialogue: TeamDialogueMessage[] = loadTeamDialogue();
  breakSocialTimer: number = 0;
  breakWanderTimer: number = 0;
  activeBreakTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

  clearBreakTimeouts(): void {
    for (const id of this.activeBreakTimeouts) {
      clearTimeout(id);
    }
    this.activeBreakTimeouts.clear();
  }
  layout: OfficeLayout;
  tileMap: TileTypeVal[][];
  seats: Map<string, Seat>;
  blockedTiles: Set<string>;
  furniture: FurnitureInstance[];
  walkableTiles: Array<{ col: number; row: number }>;
  characters: Map<number, Character> = new Map();
  pets: Pet[] = [];
  /** Accumulated time for furniture animation frame cycling */
  furnitureAnimTimer = 0;
  selectedAgentId: number | null = null;
  cameraFollowId: number | null = null;
  hoveredAgentId: number | null = null;
  hoveredTile: { col: number; row: number } | null = null;
  /** Maps "parentId:toolId" → sub-agent character ID (negative) */
  subagentIdMap: Map<string, number> = new Map();
  /** Reverse lookup: sub-agent character ID → parent info */
  subagentMeta: Map<number, { parentAgentId: number; parentToolId: string }> = new Map();
  private nextSubagentId = -1;

  /**
   * folderName → list of Area labels that workspace folder belongs to.
   * Populated by useExtensionMessages on `areaMappingsLoaded`. Consulted by
   * `findFreeSeat()` to bias new agents toward seats inside their folder's Area.
   */
  areaMappings: Record<string, string[]> = {};

  /**
   * The first-run consent greeter, deliberately NOT in `characters`.
   *
   * `characters` means "agents": everything that iterates it — seat
   * assignment, palette diversity, the wander FSM, hit-testing, the seat
   * payload the webview persists — is asking an agent question the greeter has
   * no answer to. Holding it here instead of tagging it with a flag makes
   * every one of those loops correct by default, rather than correct as long
   * as each remembers an `isGreeter` guard. It is drawn because
   * `getCharacters()` appends it, and that is the only place it joins the
   * others.
   */
  greeter: Character | null = null;

  /** World-space point the camera drifts to while the greeter is up
   *  (the bubble overlay recomputes it every frame: the combined center of the
   *  character and its speech bubble). An explicit cameraFollowId outranks it. */
  greeterCameraTarget: { x: number; y: number } | null = null;
  /** Latched by a manual pan during the ask: the user took the camera, so the
   *  overlay's per-frame updates stop re-centering. Reset on spawn/despawn. */
  private greeterCameraCancelled = false;
  leadMentoringTimer = 0;

  setAreaMappings(mappings: Record<string, string[]>): void {
    this.areaMappings = mappings;
  }

  constructor(layout?: OfficeLayout) {
    this.layout = layout || createDefaultLayout();
    this.tileMap = layoutToTileMap(this.layout);
    this.seats = layoutToSeats(this.layout.furniture);
    this.blockedTiles = getBlockedTiles(this.layout.furniture);
    this.furniture = layoutToFurnitureInstances(this.layout.furniture);
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles);
    // Pets are built last because they need walkableTiles populated for spawn.
    this.rebuildPetsFromLayout(this.layout);
  }

  /** Rebuild all derived state from a new layout. Reassigns existing characters.
   *  @param shift Optional pixel shift to apply when grid expands left/up */
  rebuildFromLayout(layout: OfficeLayout, shift?: { col: number; row: number }): void {
    this.layout = layout;
    this.tileMap = layoutToTileMap(layout);
    this.seats = layoutToSeats(layout.furniture);
    this.blockedTiles = getBlockedTiles(layout.furniture);
    this.rebuildFurnitureInstances();
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles);

    // Shift character positions when grid expands left/up
    if (shift && (shift.col !== 0 || shift.row !== 0)) {
      for (const ch of this.characters.values()) {
        ch.tileCol += shift.col;
        ch.tileRow += shift.row;
        ch.x += shift.col * TILE_SIZE;
        ch.y += shift.row * TILE_SIZE;
        // Clear path since tile coords changed
        ch.path = [];
        ch.moveProgress = 0;
      }
    }

    // Shift pet positions when grid expands left/up
    if (shift && (shift.col !== 0 || shift.row !== 0)) {
      for (const pet of this.pets) {
        pet.tileCol += shift.col;
        pet.tileRow += shift.row;
        pet.x += shift.col * TILE_SIZE;
        pet.y += shift.row * TILE_SIZE;
        pet.path = [];
        pet.moveProgress = 0;
      }
    }

    // Reassign characters to new seats, preserving existing assignments when possible
    for (const seat of this.seats.values()) {
      seat.assigned = false;
    }

    // First pass: try to keep characters at their existing seats
    for (const ch of this.characters.values()) {
      if (ch.seatId && this.seats.has(ch.seatId)) {
        const seat = this.seats.get(ch.seatId)!;
        if (!seat.assigned) {
          seat.assigned = true;
          // Snap character to seat position only if not currently in break room
          if (!ch.isTakingBreak) {
            ch.tileCol = seat.seatCol;
            ch.tileRow = seat.seatRow;
            const cx = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
            const cy = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
            ch.x = cx;
            ch.y = cy;
            ch.dir = seat.facingDir;
            ch.isSitting = true;
          }
          continue;
        }
      }
      ch.seatId = null; // will be reassigned below
    }

    // Second pass: assign remaining characters to free seats
    for (const ch of this.characters.values()) {
      if (ch.seatId) continue;
      const seatId = this.findFreeSeat(ch.folderName);
      if (seatId) {
        this.seats.get(seatId)!.assigned = true;
        ch.seatId = seatId;
        const seat = this.seats.get(seatId)!;
        if (!ch.isTakingBreak) {
          ch.tileCol = seat.seatCol;
          ch.tileRow = seat.seatRow;
          ch.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
          ch.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
          ch.dir = seat.facingDir;
          ch.isSitting = true;
        }
      }
    }

    // Relocate any characters that ended up outside bounds or on non-walkable tiles
    for (const ch of this.characters.values()) {
      if (ch.seatId) continue; // seated characters are fine
      if (
        ch.tileCol < 0 ||
        ch.tileCol >= layout.cols ||
        ch.tileRow < 0 ||
        ch.tileRow >= layout.rows
      ) {
        this.relocateCharacterToWalkable(ch);
      }
    }

    // Relocate any pets that ended up outside bounds or on non-walkable tiles
    for (const pet of this.pets) {
      if (
        pet.tileCol < 0 ||
        pet.tileCol >= layout.cols ||
        pet.tileRow < 0 ||
        pet.tileRow >= layout.rows ||
        !isWalkable(pet.tileCol, pet.tileRow, this.tileMap, this.blockedTiles)
      ) {
        if (this.walkableTiles.length > 0) {
          const spawn = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)];
          pet.tileCol = spawn.col;
          pet.tileRow = spawn.row;
          pet.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
          pet.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
          pet.path = [];
          pet.moveProgress = 0;
          pet.state = PetState.IDLE;
          pet.frame = 0;
          pet.frameTimer = 0;
          pet.followTargetId = null;
        }
      }
    }

    // Reconcile pets against the layout roster (handles editor add/remove)
    this.rebuildPetsFromLayout(layout);
  }

  /** Move a character to a random walkable tile */
  private relocateCharacterToWalkable(ch: Character): void {
    if (this.walkableTiles.length === 0) return;
    const spawn = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)];
    ch.tileCol = spawn.col;
    ch.tileRow = spawn.row;
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
    ch.path = [];
    ch.moveProgress = 0;
  }

  getLayout(): OfficeLayout {
    return this.layout;
  }

  /** Get the blocked-tile key for a character's own seat, or null */
  private ownSeatKey(ch: Character): string | null {
    if (!ch.seatId) return null;
    const seat = this.seats.get(ch.seatId);
    if (!seat) return null;
    return `${seat.seatCol},${seat.seatRow}`;
  }

  /** Temporarily unblock a character's own seat, run fn, then re-block */
  private withOwnSeatUnblocked<T>(ch: Character, fn: () => T): T {
    const key = this.ownSeatKey(ch);
    if (key) this.blockedTiles.delete(key);
    const result = fn();
    if (key) this.blockedTiles.add(key);
    return result;
  }

  /** Collect every tile occupied by electronics furniture (PCs, monitors, etc.). */
  private buildElectronicsTileSet(): Set<string> {
    const out = new Set<string>();
    for (const item of this.layout.furniture) {
      const entry = getCatalogEntry(item.type);
      if (!entry || entry.category !== 'electronics') continue;
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          out.add(`${item.col + dc},${item.row + dr}`);
        }
      }
    }
    return out;
  }

  /** Find the area label assigned to a seat's tile, or null. Public for e2e
   *  observability (getAgentSeats hook reads a seated agent's area). */
  seatZone(uid: string): string | null {
    const seat = this.seats.get(uid);
    if (!seat) return null;
    const tiles = this.layout.areaTiles;
    if (!tiles || tiles.length === 0) return null;
    const idx = seat.seatRow * this.layout.cols + seat.seatCol;
    if (idx < 0 || idx >= tiles.length) return null;
    return tiles[idx] ?? null;
  }

  /**
   * Does this seat face an electronics tile (PC, monitor)? Mirrors the
   * forward-and-flanking scan used by furniture auto-state.
   */
  private isSeatFacingElectronics(seat: Seat, electronicsTiles: Set<string>): boolean {
    const { dCol, dRow } = seatFacingOffset(seat.facingDir);
    for (let d = 1; d <= AUTO_ON_FACING_DEPTH; d++) {
      const tileCol = seat.seatCol + dCol * d;
      const tileRow = seat.seatRow + dRow * d;
      if (electronicsTiles.has(`${tileCol},${tileRow}`)) return true;
      if (dCol !== 0) {
        if (
          electronicsTiles.has(`${tileCol},${tileRow - 1}`) ||
          electronicsTiles.has(`${tileCol},${tileRow + 1}`)
        ) {
          return true;
        }
      } else if (
        electronicsTiles.has(`${tileCol - 1},${tileRow}`) ||
        electronicsTiles.has(`${tileCol + 1},${tileRow}`)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Random-pick a seat from a candidate list, biased toward seats that face an
   * electronics tile. Returns null when the candidate list is empty.
   */
  private pickFromSeats(seatUids: string[], electronicsTiles: Set<string>): string | null {
    if (seatUids.length === 0) return null;
    const pcSeats: string[] = [];
    const otherSeats: string[] = [];
    for (const uid of seatUids) {
      const seat = this.seats.get(uid);
      if (!seat) continue;
      if (this.isSeatFacingElectronics(seat, electronicsTiles)) {
        pcSeats.push(uid);
      } else {
        otherSeats.push(uid);
      }
    }
    if (pcSeats.length > 0) return pcSeats[Math.floor(Math.random() * pcSeats.length)];
    if (otherSeats.length > 0) return otherSeats[Math.floor(Math.random() * otherSeats.length)];
    return null;
  }

  /**
   * 3-stage seat picker for top-level agents.
   *
   *   Stage 1: If `folderName` is given and `areaMappings[folderName]` lists
   *            Area labels, prefer free seats whose tile is labeled with one
   *            of those areas.
   *   Stage 2: Prefer free seats whose tile has NO area label (unzoned).
   *   Stage 3: Any free seat.
   *
   * Each stage routes through `pickFromSeats` for the PC-bias rule. Returns
   * null only when every seat is already occupied. Passing `undefined`
   * preserves pre-Areas single-stage behavior (skips Stage 1; Stage 2 picks
   * unzoned seats from a layout without `areaTiles`, which is every seat).
   */
  private findFreeSeat(folderName?: string): string | null {
    const electronicsTiles = this.buildElectronicsTileSet();
    const workSeats: string[] = [];
    const allFreeSeats: string[] = [];
    for (const [uid, seat] of this.seats) {
      if (!seat.assigned) {
        allFreeSeats.push(uid);
        if (!this.isBreakRoomArea(seat.seatCol, seat.seatRow)) {
          workSeats.push(uid);
        }
      }
    }
    // Strongly prioritize workstation seats outside the break room
    const candidateSeats = workSeats.length > 0 ? workSeats : allFreeSeats;
    if (candidateSeats.length === 0) return null;

    const areaLabels = folderName ? this.areaMappings[folderName] : undefined;

    // Stage 1 — in-area seats for the folder's mapped Area labels.
    if (areaLabels && areaLabels.length > 0) {
      const wanted = new Set(areaLabels);
      const inArea = candidateSeats.filter((uid) => {
        const label = this.seatZone(uid);
        return label !== null && wanted.has(label);
      });
      const pick = this.pickFromSeats(inArea, electronicsTiles);
      if (pick) return pick;
    }

    // Stage 2 — unzoned seats (no area label, or layout has no areas at all).
    const unzoned = candidateSeats.filter((uid) => this.seatZone(uid) === null);
    const pick2 = this.pickFromSeats(unzoned, electronicsTiles);
    if (pick2) return pick2;

    // Stage 3 — any candidate seat.
    return this.pickFromSeats(candidateSeats, electronicsTiles);
  }

  /** Closest walkable tile to (col,row) not occupied by another character, or null. */
  private closestFreeWalkableTile(col: number, row: number): { col: number; row: number } | null {
    const occupied = new Set<string>();
    for (const ch of this.characters.values()) {
      occupied.add(`${ch.tileCol},${ch.tileRow}`);
    }
    let best: { col: number; row: number } | null = null;
    let bestDist = Infinity;
    for (const tile of this.walkableTiles) {
      if (occupied.has(`${tile.col},${tile.row}`)) continue;
      const d = Math.abs(tile.col - col) + Math.abs(tile.row - row);
      if (d < bestDist) {
        best = tile;
        bestDist = d;
      }
    }
    return best;
  }

  /**
   * Pick a diverse palette for a new agent based on currently active agents.
   * First 6 agents each get a unique skin (random order). Beyond 6, skins
   * repeat in balanced rounds with a random hue shift (≥45°).
   */
  private pickDiversePalette(): { palette: number; hueShift: number } {
    // Count how many non-sub-agents use each base palette (0-5)
    const paletteCount = getLoadedCharacterCount();
    const counts = new Array(paletteCount).fill(0) as number[];
    for (const ch of this.characters.values()) {
      if (ch.isSubagent) continue;
      if (ch.palette < paletteCount) counts[ch.palette]++;
    }
    return pickDiversePalette(paletteCount, counts, false);
  }

  addAgent(
    id: number,
    preferredPalette?: number,
    preferredHueShift?: number,
    preferredSeatId?: string,
    skipSpawnEffect?: boolean,
    folderName?: string,
    nearAgentId?: number,
  ): void {
    if (this.characters.has(id)) return;

    let palette: number;
    let hueShift: number;
    if (preferredPalette !== undefined) {
      palette = preferredPalette;
      hueShift = preferredHueShift ?? 0;
    } else {
      const pick = this.pickDiversePalette();
      palette = pick.palette;
      hueShift = pick.hueShift;
    }

    // Try preferred seat first, then (for teammates) the seat closest to the
    // anchor agent, then any free seat. anchorTile resolves to the anchor's SEAT
    // (stable from creation) rather than its live tile, so a teammate placed while
    // the lead is still walking to its seat still clusters around the final seat.
    const anchor = nearAgentId !== undefined ? this.characters.get(nearAgentId) : undefined;
    const anchorAt = anchorTile(anchor, this.seats);
    let seatId: string | null = null;
    if (preferredSeatId && this.seats.has(preferredSeatId)) {
      const seat = this.seats.get(preferredSeatId)!;
      if (!seat.assigned) {
        seatId = preferredSeatId;
      }
    }
    if (!seatId && anchorAt) {
      seatId = closestFreeSeat(
        this.seats,
        anchorAt.col,
        anchorAt.row,
        (s) => !this.isBreakRoomArea(s.seatCol, s.seatRow),
      );
    }
    if (!seatId) {
      seatId = this.findFreeSeat(folderName);
    }

    let ch: Character;
    if (seatId) {
      const seat = this.seats.get(seatId)!;
      seat.assigned = true;
      ch = createCharacter(id, palette, seatId, seat, hueShift);
    } else {
      // No seats — teammates spawn beside their anchor, others at a random walkable tile
      let spawn = anchorAt ? this.closestFreeWalkableTile(anchorAt.col, anchorAt.row) : null;
      if (!spawn) {
        spawn =
          this.walkableTiles.length > 0
            ? this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)]
            : { col: 1, row: 1 };
      }
      ch = createCharacter(id, palette, null, null, hueShift);
      ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
      ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
      ch.tileCol = spawn.col;
      ch.tileRow = spawn.row;
    }

    if (folderName) {
      ch.folderName = folderName;
    }
    const existingNames = Array.from(this.characters.values())
      .map((c) => c.customName || '')
      .filter(Boolean);
    const existingLead = Array.from(this.characters.values()).find((c) => c.isTeamLead);
    const isLeadOrFirst = !existingLead && (this.characters.size === 0 || id === 0);
    const profile = getAgentProfile(id, existingNames, isLeadOrFirst);
    ch.customName = profile.customName;
    ch.role = existingLead && profile.role === 'Lead' ? 'Coder' : profile.role;
    ch.currentOrder = profile.currentOrder;
    ch.orderHistory = profile.orderHistory;
    ch.delegatedFrom = profile.delegatedFrom;
    ch.isTeamLead = isLeadOrFirst;

    if (!skipSpawnEffect) {
      startMatrixEffect(ch, 'spawn');
    }
    this.characters.set(id, ch);
    this.sanitizeTeamHierarchy();
  }

  // ── Greeter ───────────────────────────────────────────────────
  // The Intro is diegetic: a char_0 character stands near the office's
  // bottom-left corner and "speaks" the tour through a DOM bubble
  // (IntroBubble). It is not an agent — see the `greeter` field.

  /** Spawn the greeter near the office's bottom-left corner: target tile
   *  GREETER_TILE_MARGIN in from the left and bottom edges, falling
   *  back to the closest walkable tile when the target is a seat, furniture,
   *  a wall, or VOID (seat tiles are in blockedTiles, so closestFreeWalkableTile
   *  covers every one of those). Idempotent; a remount mid-despawn (StrictMode)
   *  revives it. */
  spawnGreeter(): void {
    this.greeterCameraCancelled = false;
    if (this.greeter) {
      if (this.greeter.matrixEffect === 'despawn') startMatrixEffect(this.greeter, 'spawn');
      return;
    }
    const spawn = this.closestFreeWalkableTile(
      GREETER_TILE_MARGIN,
      this.layout.rows - 1 - GREETER_TILE_MARGIN,
    );
    if (!spawn) return; // no walkable tile — IntroBubble falls back to a fixed panel
    const ch = createCharacter(GREETER_ID, 0, null, null, 0);
    ch.isGreeter = true;
    ch.state = CharacterState.IDLE;
    ch.isActive = false;
    ch.dir = Direction.DOWN;
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
    ch.tileCol = spawn.col;
    ch.tileRow = spawn.row;
    startMatrixEffect(ch, 'spawn');
    this.greeter = ch;
  }

  /** Start the greeter's despawn effect and release the greeter camera. The
   *  character is dropped once the effect finishes (see update()).
   *  Idempotent — every close path (answer, Escape, hooksStatus) funnels here. */
  despawnGreeter(): void {
    this.greeterCameraTarget = null;
    this.greeterCameraCancelled = false;
    if (!this.greeter || this.greeter.matrixEffect === 'despawn') return;
    startMatrixEffect(this.greeter, 'despawn');
  }

  /** Per-frame update from the bubble overlay; ignored once the user panned. */
  setGreeterCameraTarget(p: { x: number; y: number }): void {
    if (!this.greeterCameraCancelled) this.greeterCameraTarget = p;
  }

  /** Manual pan during the ask: stop re-centering until the next spawn. */
  cancelGreeterCamera(): void {
    this.greeterCameraTarget = null;
    this.greeterCameraCancelled = true;
  }

  removeAgent(id: number): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    if (ch.isCopilotPixelAgent) return; // Persistent CopilotPixel agents never disappear
    if (ch.matrixEffect === 'despawn') return; // already despawning
    // Free seat and clear selection immediately
    if (ch.seatId) {
      const seat = this.seats.get(ch.seatId);
      if (seat) seat.assigned = false;
    }
    if (this.selectedAgentId === id) this.selectedAgentId = null;
    if (this.cameraFollowId === id) this.cameraFollowId = null;
    // Start despawn animation instead of immediate delete
    startMatrixEffect(ch, 'despawn');
    ch.bubbleType = null;
  }

  /** Find seat uid at a given tile position, or null */
  getSeatAtTile(col: number, row: number): string | null {
    for (const [uid, seat] of this.seats) {
      if (seat.seatCol === col && seat.seatRow === row) return uid;
    }
    return null;
  }

  /** Reassign an agent from their current seat to a new seat */
  reassignSeat(agentId: number, seatId: string): void {
    const ch = this.characters.get(agentId);
    if (!ch) return;
    // Unassign old seat
    if (ch.seatId) {
      const old = this.seats.get(ch.seatId);
      if (old) old.assigned = false;
    }
    // Assign new seat
    const seat = this.seats.get(seatId);
    if (!seat || seat.assigned) return;
    seat.assigned = true;
    ch.seatId = seatId;
    // Pathfind to new seat (unblock own seat tile for this query)
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles),
    );
    if (path.length > 0) {
      ch.path = path;
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
    } else {
      // Already at seat or no path — sit down
      ch.state = CharacterState.TYPE;
      ch.dir = seat.facingDir;
      ch.frame = 0;
      ch.frameTimer = 0;
      if (!ch.isActive) {
        ch.seatTimer = INACTIVE_SEAT_TIMER_MIN_SEC + Math.random() * INACTIVE_SEAT_TIMER_RANGE_SEC;
      }
    }
  }

  /**
   * Move a just-linked teammate to the free seat closest to its lead, so teams
   * cluster. Only moves when that seat is strictly closer than the teammate's
   * current one — a teammate created as a plain external agent (seated by an
   * arbitrary findFreeSeat) and tagged as a teammate only after tag discovery
   * would otherwise keep its arbitrary seat, unlike an inline teammate seated
   * next to the lead at creation.
   */
  private reseatNextToLead(teammateId: number, leadId: number): void {
    const teammate = this.characters.get(teammateId);
    const lead = this.characters.get(leadId);
    if (!teammate || !lead) return;
    const anchorAt = anchorTile(lead, this.seats);
    if (!anchorAt) return;
    const target = closestFreeSeat(
      this.seats,
      anchorAt.col,
      anchorAt.row,
      (s) => !this.isBreakRoomArea(s.seatCol, s.seatRow),
    );
    if (!target || target === teammate.seatId) return;
    const targetSeat = this.seats.get(target)!;
    const targetDist =
      Math.abs(targetSeat.seatCol - anchorAt.col) + Math.abs(targetSeat.seatRow - anchorAt.row);
    const currentSeat = teammate.seatId ? this.seats.get(teammate.seatId) : undefined;
    const currentDist = currentSeat
      ? Math.abs(currentSeat.seatCol - anchorAt.col) + Math.abs(currentSeat.seatRow - anchorAt.row)
      : Infinity;
    if (targetDist < currentDist) {
      this.reassignSeat(teammateId, target);
    }
  }

  /** Send an agent back to their currently assigned seat */
  sendToSeat(agentId: number): void {
    const ch = this.characters.get(agentId);
    if (!ch || !ch.seatId) return;
    const seat = this.seats.get(ch.seatId);
    if (!seat) return;
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles),
    );
    if (path.length > 0) {
      ch.path = path;
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
    } else {
      // Already at seat — sit down
      ch.state = CharacterState.TYPE;
      ch.dir = seat.facingDir;
      ch.frame = 0;
      ch.frameTimer = 0;
      if (!ch.isActive) {
        ch.seatTimer = INACTIVE_SEAT_TIMER_MIN_SEC + Math.random() * INACTIVE_SEAT_TIMER_RANGE_SEC;
      }
    }
  }

  /** Walk an agent to an arbitrary walkable tile (right-click command) */
  walkToTile(agentId: number, col: number, row: number): boolean {
    const ch = this.characters.get(agentId);
    if (!ch || ch.isSubagent) return false;
    if (!isWalkable(col, row, this.tileMap, this.blockedTiles)) {
      // Also allow walking to own seat tile (blocked for others but not self)
      const key = this.ownSeatKey(ch);
      if (!key || key !== `${col},${row}`) return false;
    }
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, col, row, this.tileMap, this.blockedTiles),
    );
    if (path.length === 0) return false;
    ch.path = path;
    ch.moveProgress = 0;
    ch.state = CharacterState.WALK;
    ch.frame = 0;
    ch.frameTimer = 0;
    return true;
  }

  /** Create or wake a sub-agent worker, assigning dynamic role based on task action. */
  addSubagent(
    parentAgentId: number,
    parentToolId: string,
    toolName?: string | null,
    status?: string | null,
  ): number {
    const key = `${parentAgentId}:${parentToolId}`;
    if (this.subagentIdMap.has(key)) return this.subagentIdMap.get(key)!;

    const dynamicRole = inferWorkerRole(toolName, status);

    // Gather all workers belonging to this lead and pick randomly among available ones
    const activeSubIds = new Set(this.subagentIdMap.values());
    const allWorkers: [number, Character][] = [];
    for (const [subId, existingCh] of this.characters.entries()) {
      if (
        existingCh.isSubagent &&
        (existingCh.parentAgentId === parentAgentId || existingCh.leadAgentId === parentAgentId)
      ) {
        allWorkers.push([subId, existingCh]);
      }
    }

    const freeWorkers = allWorkers.filter(([sId]) => !activeSubIds.has(sId));
    const candidateList = freeWorkers.length > 0 ? freeWorkers : allWorkers;

    if (candidateList.length > 0) {
      // Pick a random worker from candidates
      const [subId, existingCh] = candidateList[Math.floor(Math.random() * candidateList.length)];
      this.subagentIdMap.set(key, subId);
      this.subagentMeta.set(subId, { parentAgentId, parentToolId });
      existingCh.role = dynamicRole;
      existingCh.currentOrder = status || `Executing ${toolName || dynamicRole} task`;
      existingCh.isTakingBreak = false;
      existingCh.breakType = null;
      existingCh.isActive = true;
      if (existingCh.seatId) {
        const seat = this.seats.get(existingCh.seatId);
        if (seat) {
          const path = this.withOwnSeatUnblocked(existingCh, () =>
            findPath(
              existingCh.tileCol,
              existingCh.tileRow,
              seat.seatCol,
              seat.seatRow,
              this.tileMap,
              this.blockedTiles,
            ),
          );
          if (path.length > 0) {
            existingCh.path = path;
            existingCh.moveProgress = 0;
            existingCh.state = CharacterState.WALK;
            existingCh.isSitting = false;
          } else {
            existingCh.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
            existingCh.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
            existingCh.tileCol = seat.seatCol;
            existingCh.tileRow = seat.seatRow;
            existingCh.dir = seat.facingDir;
            existingCh.state = CharacterState.TYPE;
            existingCh.isSitting = true;
          }
        } else {
          existingCh.state = CharacterState.TYPE;
        }
      } else {
        existingCh.state = CharacterState.TYPE;
      }
      return subId;
    }

    const id = this.nextSubagentId--;
    const parentCh = this.characters.get(parentAgentId);
    const parentPalette = parentCh ? parentCh.palette : 0;
    // Guaranteed diverse palette (different from parent) and distinct hueShift
    const palette = (parentPalette + 1 + Math.floor(Math.random() * 5)) % 6;
    const hueShift = 0;

    // Try to find a free seat in the office first, or fall back to closest walkable tile to parent
    const seatId = this.findFreeSeat(parentCh?.folderName);
    const seat = seatId ? (this.seats.get(seatId) ?? null) : null;
    if (seat) seat.assigned = true;

    const parentCol = parentCh ? parentCh.tileCol : 0;
    const parentRow = parentCh ? parentCh.tileRow : 0;
    let spawn = seat
      ? { col: seat.seatCol, row: seat.seatRow }
      : { col: parentCol, row: parentRow };
    if (!seat && this.walkableTiles.length > 0) {
      spawn = this.closestFreeWalkableTile(parentCol, parentRow) ?? this.walkableTiles[0];
    }

    const ch = createCharacter(id, palette, seatId, seat, hueShift);
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
    ch.tileCol = spawn.col;
    ch.tileRow = spawn.row;
    if (seat) {
      ch.dir = seat.facingDir;
      ch.state = CharacterState.TYPE;
    } else if (parentCh) {
      ch.dir = parentCh.dir;
      ch.state = CharacterState.TYPE;
    }
    ch.isSubagent = true;
    ch.parentAgentId = parentAgentId;
    ch.isCopilotPixelAgent = true;
    const existingSubNames = Array.from(this.characters.values())
      .map((c) => c.customName || '')
      .filter(Boolean);
    const subProfile = getAgentProfile(id, existingSubNames, false);
    ch.customName = subProfile.customName;
    ch.role = dynamicRole;
    ch.currentOrder = status || subProfile.currentOrder;
    ch.orderHistory = subProfile.orderHistory;
    ch.delegatedFrom = subProfile.delegatedFrom;

    startMatrixEffect(ch, 'spawn');
    this.characters.set(id, ch);

    this.subagentIdMap.set(key, id);
    this.subagentMeta.set(id, { parentAgentId, parentToolId });
    return id;
  }

  /** Remove a specific sub-agent character and free its seat */
  removeSubagent(parentAgentId: number, parentToolId: string): void {
    const key = `${parentAgentId}:${parentToolId}`;
    const id = this.subagentIdMap.get(key);
    if (id === undefined) return;

    const ch = this.characters.get(id);
    if (ch) {
      if (ch.matrixEffect === 'despawn') {
        // Already despawning — just clean up maps
        this.subagentIdMap.delete(key);
        this.subagentMeta.delete(id);
        return;
      }
      if (ch.seatId) {
        const seat = this.seats.get(ch.seatId);
        if (seat) seat.assigned = false;
      }
      // Start despawn animation — keep character in map for rendering
      startMatrixEffect(ch, 'despawn');
      ch.bubbleType = null;
    }
    // Clean up tracking maps immediately so keys don't collide
    this.subagentIdMap.delete(key);
    this.subagentMeta.delete(id);
    if (this.selectedAgentId === id) this.selectedAgentId = null;
    if (this.cameraFollowId === id) this.cameraFollowId = null;
  }

  /** Remove all sub-agents belonging to a parent agent */
  removeAllSubagents(parentAgentId: number): void {
    const toRemove: string[] = [];
    for (const [key, id] of this.subagentIdMap) {
      const meta = this.subagentMeta.get(id);
      if (meta && meta.parentAgentId === parentAgentId) {
        const ch = this.characters.get(id);
        if (ch) {
          if (ch.isCopilotPixelAgent) {
            continue; // Persistent CopilotPixel agents are kept alive
          }
          if (ch.matrixEffect === 'despawn') {
            // Already despawning — just clean up maps
            this.subagentMeta.delete(id);
            toRemove.push(key);
            continue;
          }
          if (ch.seatId) {
            const seat = this.seats.get(ch.seatId);
            if (seat) seat.assigned = false;
          }
          // Start despawn animation
          startMatrixEffect(ch, 'despawn');
          ch.bubbleType = null;
        }
        this.subagentMeta.delete(id);
        if (this.selectedAgentId === id) this.selectedAgentId = null;
        if (this.cameraFollowId === id) this.cameraFollowId = null;
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      this.subagentIdMap.delete(key);
    }
  }

  /** Look up the sub-agent character ID for a given parent+toolId, or null */
  getSubagentId(parentAgentId: number, parentToolId: string): number | null {
    return this.subagentIdMap.get(`${parentAgentId}:${parentToolId}`) ?? null;
  }

  setAgentActive(id: number, active: boolean): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.isActive = active;
      if (active && ch.isTakingBreak) {
        this.returnAgentFromBreak(id);
      }
      if (!active) {
        // Sentinel -1: signals turn just ended, skip next seat rest timer.
        // Prevents the WALK handler from setting a 2-4 min rest on arrival.
        ch.seatTimer = -1;
        ch.path = [];
        ch.moveProgress = 0;
      }
      this.rebuildFurnitureInstances();
    }
  }

  /** Rebuild furniture instances with auto-state applied (active agents turn electronics ON) */
  private rebuildFurnitureInstances(): void {
    // Collect tiles where active agents face desks
    const autoOnTiles = new Set<string>();
    for (const ch of this.characters.values()) {
      if (!ch.isActive || !ch.seatId) continue;
      const seat = this.seats.get(ch.seatId);
      if (!seat) continue;
      // Find the desk tile(s) the agent faces from their seat
      const dCol =
        seat.facingDir === Direction.RIGHT ? 1 : seat.facingDir === Direction.LEFT ? -1 : 0;
      const dRow = seat.facingDir === Direction.DOWN ? 1 : seat.facingDir === Direction.UP ? -1 : 0;
      // Check tiles in the facing direction (desk could be 1-3 tiles deep)
      for (let d = 1; d <= AUTO_ON_FACING_DEPTH; d++) {
        const tileCol = seat.seatCol + dCol * d;
        const tileRow = seat.seatRow + dRow * d;
        autoOnTiles.add(`${tileCol},${tileRow}`);
      }
      // Also check tiles to the sides of the facing direction (desks can be wide)
      for (let d = 1; d <= AUTO_ON_SIDE_DEPTH; d++) {
        const baseCol = seat.seatCol + dCol * d;
        const baseRow = seat.seatRow + dRow * d;
        if (dCol !== 0) {
          // Facing left/right: check tiles above and below
          autoOnTiles.add(`${baseCol},${baseRow - 1}`);
          autoOnTiles.add(`${baseCol},${baseRow + 1}`);
        } else {
          // Facing up/down: check tiles left and right
          autoOnTiles.add(`${baseCol - 1},${baseRow}`);
          autoOnTiles.add(`${baseCol + 1},${baseRow}`);
        }
      }
    }

    if (autoOnTiles.size === 0) {
      this.furniture = layoutToFurnitureInstances(this.layout.furniture);
      return;
    }

    // Build modified furniture list with auto-state and animation applied
    const animFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC);
    const modifiedFurniture: PlacedFurniture[] = this.layout.furniture.map((item) => {
      const entry = getCatalogEntry(item.type);
      if (!entry) return item;
      // Check if any tile of this furniture overlaps an auto-on tile
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          if (autoOnTiles.has(`${item.col + dc},${item.row + dr}`)) {
            let onType = getOnStateType(item.type);
            if (onType !== item.type) {
              // Check if the on-state type has animation frames
              const frames = getAnimationFrames(onType);
              if (frames && frames.length > 1) {
                const frameIdx = animFrame % frames.length;
                onType = frames[frameIdx];
              }
              return { ...item, type: onType };
            }
            return item;
          }
        }
      }
      return item;
    });

    this.furniture = layoutToFurnitureInstances(modifiedFurniture);
  }

  setAgentTool(id: number, tool: string | null): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.currentTool = tool;
      if (tool && ch.isTakingBreak) {
        this.returnAgentFromBreak(id);
      }
    }
  }

  showPermissionBubble(id: number): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.bubbleType = 'permission';
      ch.bubbleTimer = 0;
    }
  }

  clearPermissionBubble(id: number): void {
    const ch = this.characters.get(id);
    if (ch && ch.bubbleType === 'permission') {
      ch.bubbleType = null;
      ch.bubbleTimer = 0;
    }
  }

  showWaitingBubble(id: number, awaitingInput = false): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.bubbleType = 'waiting';
      ch.waitingAwaitingInput = awaitingInput;
      ch.bubbleTimer = WAITING_BUBBLE_DURATION_SEC;
    }
  }

  /** Dismiss bubble on click — permission: instant, waiting: quick fade */
  dismissBubble(id: number): void {
    const ch = this.characters.get(id);
    if (!ch || !ch.bubbleType) return;
    if (ch.bubbleType === 'permission') {
      ch.bubbleType = null;
      ch.bubbleTimer = 0;
    } else if (ch.bubbleType === 'waiting') {
      // Trigger immediate fade (0.3s remaining)
      ch.bubbleTimer = Math.min(ch.bubbleTimer, DISMISS_BUBBLE_FAST_FADE_SEC);
    }
  }

  // ── Pets ──────────────────────────────────────────────────────

  /**
   * Add a pet to the live runtime. Spawns at a uniformly-random walkable tile.
   * Mirror in `this.layout.pets` so debounced saveLayout serialises the roster.
   * Bounds-checks petType against the loaded sprite count to defend against stale layouts.
   */
  addPet(placedPet: PlacedPet): void {
    // Defensive guards (upstream 5e6c0a0)
    if (
      typeof placedPet.id !== 'string' ||
      placedPet.id.length === 0 ||
      placedPet.id.length > MAX_PET_ID_LENGTH
    ) {
      return;
    }
    if (
      !Number.isInteger(placedPet.petType) ||
      placedPet.petType < 0 ||
      placedPet.petType >= getPetCount()
    ) {
      return;
    }
    if (this.pets.some((p) => p.id === placedPet.id)) return; // de-dupe
    if (this.walkableTiles.length === 0) return; // no spawn space — silently drop

    const spawn = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)];
    const pet = createPet(placedPet.id, placedPet.petType, spawn.col, spawn.row);
    pet.name = getPetName(placedPet.petType);
    this.pets.push(pet);
    this.syncLayoutPets();
  }

  /** Remove a pet by id. Idempotent. */
  removePet(id: string): void {
    const before = this.pets.length;
    this.pets = this.pets.filter((p) => p.id !== id);
    if (this.pets.length !== before) {
      this.syncLayoutPets();
    }
  }

  /** Shallow snapshot for external consumers (renderer, hooks). */
  getPets(): Pet[] {
    return this.pets.slice();
  }

  /** Unique petType values currently placed. Used by the Pets toolbar to mark active rows. */
  getActivePetTypes(): number[] {
    const seen = new Set<number>();
    for (const p of this.pets) seen.add(p.petType);
    return Array.from(seen);
  }

  /**
   * Hit-test pets at a pixel world position. Sorts back-to-front (largest y wins on tie)
   * so the visually-frontmost pet receives the click.
   * Returns the pet id or null.
   */
  getPetAt(worldX: number, worldY: number): string | null {
    const ordered = this.pets.slice().sort((a, b) => b.y - a.y);
    for (const pet of ordered) {
      const left = pet.x - PET_HIT_HALF_WIDTH;
      const right = pet.x + PET_HIT_HALF_WIDTH;
      const top = pet.y - PET_HIT_HEIGHT;
      const bottom = pet.y;
      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        return pet.id;
      }
    }
    return null;
  }

  /** Show the heart bubble on a pet for WAITING_BUBBLE_DURATION_SEC. */
  showPetBubble(petId: string): void {
    const pet = this.pets.find((p) => p.id === petId);
    if (!pet) return;
    pet.bubbleType = 'heart';
    pet.bubbleTimer = WAITING_BUBBLE_DURATION_SEC;
  }

  /** Dismiss the heart bubble on click; collapses timer to a fast fade. */
  dismissPetBubble(petId: string): void {
    const pet = this.pets.find((p) => p.id === petId);
    if (!pet || !pet.bubbleType) return;
    pet.bubbleTimer = Math.min(pet.bubbleTimer, DISMISS_BUBBLE_FAST_FADE_SEC);
  }

  /**
   * Reconcile `this.pets` to match the layout's placed-pet roster.
   * - Pets in layout but not in runtime → spawn via addPet().
   * - Pets in runtime but not in layout → remove.
   * - Pets in both → keep existing runtime state (position, FSM).
   *
   * Called from constructor and rebuildFromLayout. Always runs AFTER walkableTiles
   * is populated.
   */
  private rebuildPetsFromLayout(layout: OfficeLayout): void {
    const placed = layout.pets ?? [];
    const placedIds = new Set(placed.map((p) => p.id));

    // 1. Remove pets no longer in layout
    this.pets = this.pets.filter((p) => placedIds.has(p.id));

    // 2. Add pets that exist in layout but not in runtime
    const existingIds = new Set(this.pets.map((p) => p.id));
    for (const p of placed) {
      if (existingIds.has(p.id)) continue;
      this.addPet(p); // pushes onto this.pets, calls syncLayoutPets()
    }
    // syncLayoutPets() inside addPet keeps this.layout.pets coherent; one final
    // sync handles the removal-only branch where addPet was never called.
    this.syncLayoutPets();
  }

  /**
   * Re-export the current pet roster into `this.layout.pets`. Called only from
   * mutating methods (addPet / removePet / rebuildPetsFromLayout) — NEVER from
   * getLayout(), which runs on every render frame.
   */
  private syncLayoutPets(): void {
    this.layout.pets = this.pets.map((p) => ({ id: p.id, petType: p.petType }));
  }

  setTeamInfo(
    id: number,
    teamName?: string,
    agentName?: string,
    isTeamLead?: boolean,
    leadAgentId?: number,
    teamUsesTmux?: boolean,
  ): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    const wasUnlinked = ch.leadAgentId === undefined;
    if (teamName !== undefined) ch.teamName = teamName;
    if (agentName !== undefined) ch.agentName = agentName;
    if (isTeamLead !== undefined) {
      ch.isTeamLead = isTeamLead;
      if (isTeamLead) {
        ch.role = 'Lead';
        ch.isSubagent = false;
        for (const [otherId, otherCh] of this.characters.entries()) {
          if (otherId !== id && otherCh.isTeamLead) {
            otherCh.isTeamLead = false;
            if (otherCh.role === 'Lead') {
              otherCh.role = 'Teammate';
            }
          }
        }
      }
    }
    if (leadAgentId !== undefined) {
      ch.leadAgentId = leadAgentId;
      ch.isSubagent = true;
      ch.isTeamLead = false;
      if (ch.role === 'Lead') {
        ch.role = 'Teammate';
      }
    }
    if (teamUsesTmux !== undefined) {
      ch.teamUsesTmux = teamUsesTmux;
    }
    if (leadAgentId !== undefined) {
      ch.isHeadless = false;
    }
    if (wasUnlinked && leadAgentId !== undefined && !isTeamLead) {
      this.reseatNextToLead(id, leadAgentId);
    }
    this.sanitizeTeamHierarchy();
  }

  /** Mark an agent as headless (adopted, no terminal to focus). */
  setHeadless(id: number, headless: boolean): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    ch.isHeadless = headless;
  }

  setAgentContext(id: number, contextTokens: number, maxContextTokens: number): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    ch.contextTokens = contextTokens;
    ch.maxContextTokens = maxContextTokens;
  }

  update(dt: number): void {
    // Furniture animation cycling
    const prevFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC);
    this.furnitureAnimTimer += dt;
    const newFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC);
    if (newFrame !== prevFrame) {
      this.rebuildFurnitureInstances();
    }

    // The greeter materializes and dematerializes like anyone else, but runs
    // no FSM — it stands where it spawned for as long as the ask is up.
    if (this.greeter && advanceMatrixEffect(this.greeter, dt) === 'despawned') {
      this.greeter = null;
    }

    const toDelete: number[] = [];
    for (const ch of this.characters.values()) {
      const effect = advanceMatrixEffect(ch, dt);
      if (effect !== 'none') {
        if (effect === 'despawned') toDelete.push(ch.id);
        continue; // skip normal FSM while the effect is (or just was) active
      }

      // Temporarily unblock own seat so character can pathfind to it
      this.withOwnSeatUnblocked(ch, () =>
        updateCharacter(ch, dt, this.walkableTiles, this.seats, this.tileMap, this.blockedTiles),
      );

      // Tick bubble timer for waiting bubbles
      if (ch.bubbleType === 'waiting') {
        ch.bubbleTimer -= dt;
        if (ch.bubbleTimer <= 0) {
          ch.bubbleType = null;
          ch.bubbleTimer = 0;
        }
      }

      // Tick dialogue speech bubble timer
      if (ch.speechBubbleTimer && ch.speechBubbleTimer > 0) {
        ch.speechBubbleTimer -= dt;
        if (ch.speechBubbleTimer <= 0) {
          ch.speechBubbleText = null;
          ch.speechBubbleTimer = 0;
        }
      }

      // Track break duration
      if (ch.isTakingBreak) {
        ch.breakDuration = (ch.breakDuration || 0) + dt;
      }
    }
    // Remove characters that finished despawn
    for (const id of toDelete) {
      this.characters.delete(id);
    }

    // ── Lead Mentoring & Workstation Patrol ─────────────────────
    this.updateLeadMentoring(dt);

    // ── Elder Scrolls Radiant AI Daily Idle Routine ─────────────
    this.routineEngine.update(this, dt);

    // ── Break Social Chatter ────────────────────────────────────
    this.breakSocialTimer += dt;
    if (this.breakSocialTimer >= 6) {
      this.breakSocialTimer = 0;
      const breakAgents = Array.from(this.characters.values()).filter(
        (c) => c.isTakingBreak && c.path.length === 0,
      );
      if (breakAgents.length >= 2) {
        // Pick two distinct random break room workers
        const idxA = Math.floor(Math.random() * breakAgents.length);
        let idxB = Math.floor(Math.random() * (breakAgents.length - 1));
        if (idxB >= idxA) idxB++;
        const a = breakAgents[idxA];
        const b = breakAgents[idxB];
        const pair = getRandomBreakDialogue();

        this.addTeamDialogue({
          fromAgentId: a.id,
          fromName: a.customName || `Agent #${a.id}`,
          fromRole: a.role || 'Teammate',
          toAgentId: b.id,
          toName: b.customName || `Agent #${b.id}`,
          toRole: b.role || 'Teammate',
          text: pair.a,
          context: 'break_room',
        });
        const aId = a.id;
        const bId = b.id;
        const timerId = setTimeout(() => {
          this.activeBreakTimeouts.delete(timerId);
          const aLive = this.characters.get(aId);
          const bLive = this.characters.get(bId);
          if (aLive && bLive && bLive.isTakingBreak) {
            this.addTeamDialogue({
              fromAgentId: bLive.id,
              fromName: bLive.customName || `Agent #${bLive.id}`,
              fromRole: bLive.role || 'Teammate',
              toAgentId: aLive.id,
              toName: aLive.customName || `Agent #${aLive.id}`,
              toRole: aLive.role || 'Teammate',
              text: pair.b,
              context: 'break_room',
            });
          }
        }, 2200);
        this.activeBreakTimeouts.add(timerId);
      } else if (breakAgents.length === 1) {
        const a = breakAgents[0];
        const thought = getRandomSoloThought();
        this.addTeamDialogue({
          fromAgentId: a.id,
          fromName: a.customName || `Agent #${a.id}`,
          fromRole: a.role || 'Teammate',
          text: thought,
          context: 'break_room',
        });
      }
    }

    // ── Break Autonomous Movement & Spot Switching ─────────────
    this.breakWanderTimer = (this.breakWanderTimer || 0) + dt;
    if (this.breakWanderTimer >= 14) {
      this.breakWanderTimer = 0;
      const breakWorkers = Array.from(this.characters.values()).filter(
        (workerCh) =>
          workerCh.isTakingBreak &&
          workerCh.path.length === 0 &&
          (!workerCh.currentOrder || workerCh.orderStatus !== 'running') &&
          !workerCh.matrixEffect,
      );

      if (breakWorkers.length > 0) {
        // Pick one random idle break worker to change spots
        const worker = breakWorkers[Math.floor(Math.random() * breakWorkers.length)];
        const allSpots = this.getBreakRoomSpots();

        // Get occupied tiles by any character
        const occupiedTiles = new Set(
          Array.from(this.characters.values()).map(
            (chItem) => chItem.tileCol + ',' + chItem.tileRow,
          ),
        );
        const freeSpots = allSpots.filter(
          (s) =>
            !occupiedTiles.has(s.col + ',' + s.row) &&
            (s.col !== worker.tileCol || s.row !== worker.tileRow),
        );

        if (freeSpots.length > 0) {
          const targetSpot = freeSpots[Math.floor(Math.random() * freeSpots.length)];
          const targetKey = targetSpot.col + ',' + targetSpot.row;
          const wasBlocked = this.blockedTiles.has(targetKey);
          if (wasBlocked) this.blockedTiles.delete(targetKey);

          const path = findPath(
            worker.tileCol,
            worker.tileRow,
            targetSpot.col,
            targetSpot.row,
            this.tileMap,
            this.blockedTiles,
          );

          if (wasBlocked) this.blockedTiles.add(targetKey);

          if (path.length > 0) {
            worker.path = path;
            worker.moveProgress = 0;
            worker.state = CharacterState.WALK;
            worker.isSitting = false;
            worker.breakTargetCol = targetSpot.col;
            worker.breakTargetRow = targetSpot.row;
            worker.breakType = targetSpot.breakType;
            worker.pendingBreakSpot = targetSpot;
          }
        }
      }
    }

    // ── Pet FSM ────────────────────────────────────────────────
    for (const pet of this.pets) {
      updatePet(pet, dt, this.walkableTiles, this.characters, this.tileMap, this.blockedTiles);

      // Tick heart bubble timer (mirrors character waiting-bubble pattern)
      if (pet.bubbleType) {
        pet.bubbleTimer -= dt;
        if (pet.bubbleTimer <= 0) {
          pet.bubbleType = null;
          pet.bubbleTimer = 0;
        }
      }
    }
  }

  /** The `saveAgentSeats` payload: palette, hue and seat for every agent worth
   *  restoring. Sub-agents are excluded because they are derived state the
   *  runtime re-materializes, and the greeter never reaches here at all —
   *  it is not in `characters`. */
  getPersistableSeats(): Record<
    number,
    { palette: number; hueShift: number; seatId: string | null }
  > {
    const seats: Record<number, { palette: number; hueShift: number; seatId: string | null }> = {};
    for (const ch of this.characters.values()) {
      if (ch.isSubagent) continue;
      seats[ch.id] = { palette: ch.palette, hueShift: ch.hueShift, seatId: ch.seatId };
    }
    return seats;
  }

  /** Everything the renderer draws: the agents plus, while the first-run ask
   *  is up, the consent greeter. This is the ONE place the greeter joins the
   *  agents — every other consumer reads `characters` and gets agents only. */
  getCharacters(): Character[] {
    const chars = Array.from(this.characters.values());
    if (this.greeter) chars.push(this.greeter);
    return chars;
  }

  /** Get character at pixel position (for hit testing). Returns id or null.
   *  Agents only: clicks pass straight through the consent greeter, which is
   *  a prop, not something to select or follow. */

  addTeamDialogue(msg: Omit<TeamDialogueMessage, 'id' | 'timestamp'>): TeamDialogueMessage {
    const fullMsg: TeamDialogueMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      ...msg,
    };
    this.teamDialogue.push(fullMsg);
    if (this.teamDialogue.length > 100) {
      this.teamDialogue = this.teamDialogue.slice(-100);
    }
    saveTeamDialogue(this.teamDialogue);

    const sender = this.characters.get(msg.fromAgentId);
    if (sender) {
      // Allow full natural speech without premature truncation
      sender.speechBubbleText = msg.text.length > 160 ? msg.text.slice(0, 157) + '...' : msg.text;
      sender.speechBubbleTimer = Math.max(4.5, Math.min(8.5, msg.text.length * 0.08));
    }

    return fullMsg;
  }

  setAgentName(id: number, name: string): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.customName = name;
      updateAgentProfile(id, { customName: name });
    }
  }

  setAgentRole(id: number, role: string): void {
    const ch = this.characters.get(id);
    if (ch) {
      if (role === 'Lead') {
        ch.isTeamLead = true;
        ch.role = 'Lead';
        ch.isSubagent = false;
        for (const [otherId, otherCh] of this.characters.entries()) {
          if (otherId !== id && otherCh.isTeamLead) {
            otherCh.isTeamLead = false;
            if (otherCh.role === 'Lead') {
              otherCh.role = 'Teammate';
              updateAgentProfile(otherId, { role: 'Teammate' });
            }
          }
        }
      } else {
        if (ch.isTeamLead) {
          ch.isTeamLead = false;
        }
        ch.role = role;
      }
      updateAgentProfile(id, { role: ch.role });
      this.sanitizeTeamHierarchy();
    }
  }

  setAgentOrder(id: number, order: string, fromAgentName?: string): void {
    const ch = this.characters.get(id);
    if (ch) {
      if (ch.isTakingBreak) {
        this.returnAgentFromBreak(id);
      }
      ch.isActive = true;
      ch.currentOrder = order;
      ch.delegatedFrom = fromAgentName || null;
      ch.orderStatus = 'running';
      updateAgentProfile(id, {
        currentOrder: order,
        delegatedFrom: fromAgentName || null,
      });
      if (ch.isCopilotPixelAgent) {
        saveOrUpdateCopilotPixelAgent({
          id,
          customName: ch.customName || `Agent #${id}`,
          role: ch.role || 'Coder',
          palette: ch.palette,
          hueShift: ch.hueShift,
          seatId: ch.seatId,
          isSubagent: ch.isSubagent,
          parentAgentId: ch.parentAgentId,
          currentOrder: order,
          delegatedFrom: fromAgentName || null,
          orderStatus: 'running',
          orderProgressMessage: null,
          orderModelName: ch.orderModelName || null,
          isTakingBreak: false,
          breakType: null,
        });
      }
    }
  }

  clearAgentOrder(id: number): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.currentOrder = null;
      ch.delegatedFrom = null;
      ch.orderStatus = null;
      ch.orderProgressMessage = null;
      ch.orderModelName = null;
      updateAgentProfile(id, { currentOrder: null, delegatedFrom: null });
    }
  }

  setAgentOrderProgress(
    id: number,
    status: 'running' | 'reading' | 'writing' | 'completed' | 'error' | 'cancelled' | null,
    message?: string,
    modelName?: string,
  ): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.orderStatus = status;
      ch.orderProgressMessage = message || null;
      if (modelName) {
        ch.orderModelName = modelName;
      }
      if (status === 'completed') {
        ch.bubbleTimer = 3;
        ch.isActive = false;
        if (ch.isCopilotPixelAgent) {
          this.startAgentBreak(id);
        }
      }
    }
  }

  startAgentBreak(id: number, breakType?: 'coffee' | 'tea' | 'snack' | 'steamdeck'): void {
    const ch = this.characters.get(id);
    if (!ch) return;

    const availableBreakTypes: Array<'coffee' | 'tea' | 'snack' | 'steamdeck'> = [
      'coffee',
      'tea',
      'snack',
      'steamdeck',
    ];
    const chosenType =
      breakType || availableBreakTypes[Math.floor(Math.random() * availableBreakTypes.length)];

    let targetTile: { col: number; row: number } | null = null;
    const breakSpots = this.getBreakRoomSpots();
    const matchingSpots = breakSpots.filter((s) => s.breakType === chosenType);
    if (matchingSpots.length > 0) {
      targetTile = matchingSpots[Math.floor(Math.random() * matchingSpots.length)];
    } else if (breakSpots.length > 0) {
      targetTile = breakSpots[Math.floor(Math.random() * breakSpots.length)];
    }

    if (!targetTile && this.walkableTiles.length > 0) {
      const valid = this.walkableTiles.filter((t) => this.isBreakRoomArea(t.col, t.row));
      targetTile =
        valid.length > 0 ? valid[Math.floor(Math.random() * valid.length)] : this.walkableTiles[0];
    }

    ch.isTakingBreak = true;
    ch.breakType = chosenType;
    ch.bubbleType = null;
    ch.bubbleTimer = 0;
    ch.speechBubbleText = null;
    ch.speechBubbleTimer = 0;
    ch.isActive = false;
    ch.breakStartTime = Date.now();
    ch.breakDuration = 0;

    if (targetTile) {
      ch.breakTargetCol = targetTile.col;
      ch.breakTargetRow = targetTile.row;
      const path = this.withOwnSeatUnblocked(ch, () =>
        findPath(
          ch.tileCol,
          ch.tileRow,
          targetTile.col,
          targetTile.row,
          this.tileMap,
          this.blockedTiles,
        ),
      );
      if (path.length > 0) {
        ch.path = path;
        ch.moveProgress = 0;
        ch.state = CharacterState.WALK;
        ch.isSitting = false;
      } else {
        ch.x = targetTile.col * TILE_SIZE + TILE_SIZE / 2;
        ch.y = targetTile.row * TILE_SIZE + TILE_SIZE / 2;
        ch.tileCol = targetTile.col;
        ch.tileRow = targetTile.row;
        ch.path = [];
        if (chosenType === 'coffee') ch.state = CharacterState.BREAK_COFFEE;
        else if (chosenType === 'snack') ch.state = CharacterState.BREAK_SNACK;
        else ch.state = CharacterState.BREAK_STEAMDECK;
      }
    }

    if (ch.isCopilotPixelAgent) {
      saveOrUpdateCopilotPixelAgent({
        id,
        customName: ch.customName || `Agent #${id}`,
        role: ch.role || 'Coder',
        palette: ch.palette,
        hueShift: ch.hueShift,
        seatId: ch.seatId,
        isSubagent: ch.isSubagent,
        parentAgentId: ch.parentAgentId,
        currentOrder: ch.currentOrder,
        delegatedFrom: ch.delegatedFrom,
        orderStatus: ch.orderStatus,
        orderProgressMessage: ch.orderProgressMessage,
        orderModelName: ch.orderModelName,
        isTakingBreak: true,
        breakType: chosenType,
      });
    }
  }

  returnAgentFromBreak(id: number): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    ch.isTakingBreak = false;
    ch.breakType = null;
    ch.breakTargetCol = null;
    ch.breakTargetRow = null;

    if (ch.seatId) {
      const seat = this.seats.get(ch.seatId);
      if (seat) {
        const path = this.withOwnSeatUnblocked(ch, () =>
          findPath(
            ch.tileCol,
            ch.tileRow,
            seat.seatCol,
            seat.seatRow,
            this.tileMap,
            this.blockedTiles,
          ),
        );
        if (path.length > 0) {
          ch.path = path;
          ch.moveProgress = 0;
          ch.state = CharacterState.WALK;
          ch.isSitting = false;
        } else {
          ch.state = CharacterState.TYPE;
          ch.dir = seat.facingDir;
        }
      }
    } else {
      ch.state = CharacterState.TYPE;
    }

    if (ch.isCopilotPixelAgent) {
      saveOrUpdateCopilotPixelAgent({
        id,
        customName: ch.customName || `Agent #${id}`,
        role: ch.role || 'Coder',
        palette: ch.palette,
        hueShift: ch.hueShift,
        seatId: ch.seatId,
        isSubagent: ch.isSubagent,
        parentAgentId: ch.parentAgentId,
        currentOrder: ch.currentOrder,
        delegatedFrom: ch.delegatedFrom,
        orderStatus: ch.orderStatus,
        orderProgressMessage: ch.orderProgressMessage,
        orderModelName: ch.orderModelName,
        isTakingBreak: false,
        breakType: null,
      });
    }
  }

  restoreCopilotPixelAgents(): number[] {
    const saved = loadCopilotPixelAgents();
    const restoredIds: number[] = [];
    const breakSpots = this.getBreakRoomSpots();

    let subCount = 0;
    for (const data of saved) {
      if (data.isSubagent) {
        subCount++;
        // Prune legacy excess workers beyond 5
        if (subCount > 5) {
          removeCopilotPixelAgent(data.id);
          continue;
        }
      }

      if (this.characters.has(data.id)) {
        restoredIds.push(data.id);
        continue;
      }
      let seat = data.seatId ? (this.seats.get(data.seatId) ?? null) : null;
      let seatId = data.seatId;
      if (!seat || seat.assigned) {
        seatId = this.findFreeSeat();
        seat = seatId ? (this.seats.get(seatId) ?? null) : null;
      }
      if (seat) seat.assigned = true;

      // Human skin tones: valid palette 0-5, strictly 0 hue shift
      const palette = Math.abs(data.palette || 0) % 6;
      const hueShift = 0;

      const spot = breakSpots[restoredIds.length % breakSpots.length] || {
        col: 17,
        row: 14,
        breakType: 'coffee' as const,
        state: CharacterState.BREAK_COFFEE,
        dir: Direction.DOWN,
      };

      // Subagents without an active running order are strictly stationed in the break room
      const isRunning = Boolean(data.currentOrder && data.orderStatus === 'running');
      const isTakingBreak = data.isSubagent ? !isRunning : Boolean(data.isTakingBreak);

      const spawn = isTakingBreak
        ? { col: spot.col, row: spot.row }
        : seat
          ? { col: seat.seatCol, row: seat.seatRow }
          : { col: spot.col, row: spot.row };

      const ch = createCharacter(data.id, palette, seatId, seat, hueShift);
      ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
      ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
      ch.tileCol = spawn.col;
      ch.tileRow = spawn.row;
      ch.customName = data.customName;
      ch.isSubagent = Boolean(data.isSubagent);
      ch.parentAgentId = data.parentAgentId;
      ch.isTeamLead = !ch.isSubagent && Boolean(data.isTeamLead);
      ch.role = ch.isSubagent ? (data.role === 'Lead' ? 'Teammate' : data.role) : data.role;
      ch.leadAgentId = data.leadAgentId;
      ch.spawnedByName = data.spawnedByName;
      ch.currentOrder = data.currentOrder;
      ch.delegatedFrom = data.delegatedFrom;
      ch.orderStatus = (data.orderStatus as Character['orderStatus']) ?? null;
      ch.orderProgressMessage = data.orderProgressMessage;
      ch.orderModelName = data.orderModelName;
      ch.isCopilotPixelAgent = true;
      ch.hueShift = 0;

      if (isTakingBreak) {
        ch.isTakingBreak = true;
        ch.isSitting = data.isSitting !== undefined ? data.isSitting : spot.isSitting;
        ch.breakType = data.breakType || spot.breakType;
        if (ch.breakType === 'coffee' || ch.breakType === 'tea')
          ch.state = CharacterState.BREAK_COFFEE;
        else if (ch.breakType === 'snack') ch.state = CharacterState.BREAK_SNACK;
        else if (ch.breakType === 'steamdeck') ch.state = CharacterState.BREAK_STEAMDECK;
        else ch.state = CharacterState.BREAK_COFFEE;
        ch.dir = spot.dir;
      } else {
        ch.state = seat ? CharacterState.TYPE : CharacterState.IDLE;
        if (seat) ch.dir = seat.facingDir;
      }

      this.characters.set(data.id, ch);
      restoredIds.push(data.id);
    }
    this.sanitizeTeamHierarchy();
    return restoredIds;
  }

  despawnCopilotPixelAgent(id: number): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.isCopilotPixelAgent = false;
      removeCopilotPixelAgent(id);
      if (ch.seatId) {
        const seat = this.seats.get(ch.seatId);
        if (seat) seat.assigned = false;
      }
      startMatrixEffect(ch, 'despawn');
    }
  }

  delegateOrder(fromAgentId: number, toAgentId: number, order: string): boolean {
    const fromCh = this.characters.get(fromAgentId);
    const toCh = this.characters.get(toAgentId);
    if (!toCh) return false;
    const fromName = fromCh?.customName || 'Agent #' + fromAgentId;
    this.setAgentOrder(toAgentId, order, fromName);
    return true;
  }

  spawnSubagentWithRole(
    parentAgentId: number,
    role = 'Coder',
    name?: string,
    initialTask?: string,
  ): number {
    const parentToolId =
      'manual_spawn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const subId = this.addSubagent(parentAgentId, parentToolId);
    const subCh = this.characters.get(subId);
    if (subCh) {
      subCh.isCopilotPixelAgent = true;
      if (name) {
        subCh.customName = name;
      }
      subCh.role = role;
      if (initialTask) {
        const parentCh = this.characters.get(parentAgentId);
        subCh.currentOrder = initialTask;
        subCh.delegatedFrom = parentCh?.customName || 'Lead #' + parentAgentId;
      }
      updateAgentProfile(subId, {
        customName: subCh.customName,
        role: subCh.role,
        currentOrder: subCh.currentOrder,
        delegatedFrom: subCh.delegatedFrom,
      });
      saveOrUpdateCopilotPixelAgent({
        id: subId,
        customName: subCh.customName || `Subagent #${subId}`,
        role: subCh.role || 'Coder',
        palette: subCh.palette,
        hueShift: subCh.hueShift,
        seatId: subCh.seatId,
        isSubagent: true,
        parentAgentId: parentAgentId,
        currentOrder: subCh.currentOrder || null,
        delegatedFrom: subCh.delegatedFrom || null,
        orderStatus: subCh.orderStatus || null,
        orderProgressMessage: subCh.orderProgressMessage || null,
        orderModelName: subCh.orderModelName || null,
        isTakingBreak: subCh.isTakingBreak,
        breakType: subCh.breakType,
      });
    }
    return subId;
  }

  /**
   * Ensures that the Lead agent has a dedicated squad of subagents stationed in the Break Room.
   * If fewer than `count` subagents exist for this lead, creates them and places them on break.
   */
  /**
   * Ensures the Lead agent has a dedicated squad of workers stationed in the Break Room.
   * By default, at least 5 workers (total 6 agents minimum including 1 team leader).
   * Can scale up if the layout provides more seats, naming each worker uniquely.
   * In the Break Room they rest as Teammate; they take dynamic roles only when called to work.
   */
  /** Returns true if a tile is situated in the common Break Room / Lounge area */
  isBreakRoomArea(col: number, row: number): boolean {
    if (row < 10) return false;
    if (this.layout.cols >= 18 && col >= 11) return true;
    if (this.tileMap && this.tileMap[row] && this.tileMap[row][col] !== undefined) {
      const tile = this.tileMap[row][col];
      if (tile === 1 || tile === 9) return true;
    }
    return col >= Math.floor(this.layout.cols / 2);
  }

  /** Returns verified walkable spots located inside the Break Room. */
  getBreakRoomSpots(): Array<{
    col: number;
    row: number;
    breakType: 'coffee' | 'tea' | 'snack' | 'steamdeck';
    state: CharacterState;
    dir: Direction;
    isSitting: boolean;
  }> {
    const spots: Array<{
      col: number;
      row: number;
      breakType: 'coffee' | 'tea' | 'snack' | 'steamdeck';
      state: CharacterState;
      dir: Direction;
      isSitting: boolean;
    }> = [];

    // 1. Lounge sofa front (Steam Deck, sitting)
    const sofaFront = this.layout.furniture.find(
      (f) => f.type === 'SOFA_FRONT' && this.isBreakRoomArea(f.col, f.row),
    );
    if (sofaFront) {
      spots.push({
        col: sofaFront.col,
        row: sofaFront.row,
        breakType: 'steamdeck',
        state: CharacterState.BREAK_STEAMDECK,
        dir: Direction.DOWN,
        isSitting: true,
      });
    }

    // 2. Lounge sofa side left (coffee / tea, sitting)
    const sofaSide = this.layout.furniture.find(
      (f) => f.type === 'SOFA_SIDE' && this.isBreakRoomArea(f.col, f.row),
    );
    if (sofaSide) {
      spots.push({
        col: sofaSide.col,
        row: sofaSide.row,
        breakType: 'coffee',
        state: CharacterState.BREAK_COFFEE,
        dir: Direction.RIGHT,
        isSitting: true,
      });
    }

    // 3. Lounge sofa side right (Steam Deck, sitting)
    const sofaSide2 = this.layout.furniture.find(
      (f) => f.type.startsWith('SOFA_SIDE:') && this.isBreakRoomArea(f.col, f.row),
    );
    if (sofaSide2) {
      spots.push({
        col: sofaSide2.col,
        row: sofaSide2.row,
        breakType: 'steamdeck',
        state: CharacterState.BREAK_STEAMDECK,
        dir: Direction.LEFT,
        isSitting: true,
      });
    }

    // 4. Lounge sofa back (Steam Deck, sitting)
    const sofaBack = this.layout.furniture.find(
      (f) => f.type === 'SOFA_BACK' && this.isBreakRoomArea(f.col, f.row),
    );
    if (sofaBack) {
      spots.push({
        col: sofaBack.col,
        row: sofaBack.row,
        breakType: 'steamdeck',
        state: CharacterState.BREAK_STEAMDECK,
        dir: Direction.UP,
        isSitting: true,
      });
    }

    // 5. Dining table chair right (snack, sitting)
    const dChair = this.layout.furniture.find(
      (f) => f.type === 'WOODEN_CHAIR_SIDE' && this.isBreakRoomArea(f.col, f.row),
    );
    if (dChair) {
      spots.push({
        col: dChair.col,
        row: dChair.row,
        breakType: 'snack',
        state: CharacterState.BREAK_SNACK,
        dir: Direction.RIGHT,
        isSitting: true,
      });
    }

    // 6. Dining table chair left (tea, sitting)
    const dChair2 = this.layout.furniture.find(
      (f) => f.type.startsWith('WOODEN_CHAIR_SIDE:') && this.isBreakRoomArea(f.col, f.row),
    );
    if (dChair2) {
      spots.push({
        col: dChair2.col,
        row: dChair2.row,
        breakType: 'tea',
        state: CharacterState.BREAK_COFFEE,
        dir: Direction.LEFT,
        isSitting: true,
      });
    }

    // 7. Dining cushioned chair (coffee / snack, sitting)
    const cChair = this.layout.furniture.find(
      (f) => f.type === 'CUSHIONED_CHAIR' && this.isBreakRoomArea(f.col, f.row),
    );
    if (cChair) {
      spots.push({
        col: cChair.col,
        row: cChair.row,
        breakType: 'snack',
        state: CharacterState.BREAK_SNACK,
        dir: Direction.UP,
        isSitting: true,
      });
    }

    // 8. Reading bench (tea, sitting)
    const bench = this.layout.furniture.find(
      (f) =>
        (f.type.includes('BENCH') || f.type.includes('WOODEN_BENCH')) &&
        this.isBreakRoomArea(f.col, f.row),
    );
    if (bench) {
      spots.push({
        col: bench.col,
        row: bench.row,
        breakType: 'tea',
        state: CharacterState.BREAK_COFFEE,
        dir: Direction.DOWN,
        isSitting: true,
      });
    }

    // 9. Kitchen Stovetop & Oven (cooking at fuochi, standing facing UP)
    const stovetop = this.layout.furniture.find((f) => f.type === 'KITCHEN_STOVETOP');
    if (stovetop) {
      spots.push({
        col: stovetop.col,
        row: stovetop.row + 1,
        breakType: 'snack',
        state: CharacterState.BREAK_SNACK,
        dir: Direction.UP,
        isSitting: false,
      });
    }

    // 10. Espresso Machine (brewing espresso, standing facing UP)
    const coffeeMachine = this.layout.furniture.find((f) => f.type === 'COFFEE_MACHINE');
    if (coffeeMachine) {
      spots.push({
        col: coffeeMachine.col,
        row: coffeeMachine.row + 1,
        breakType: 'coffee',
        state: CharacterState.BREAK_COFFEE,
        dir: Direction.UP,
        isSitting: false,
      });
    }

    // 11. Tea Station (steeping tea, standing facing UP)
    const teaStation = this.layout.furniture.find((f) => f.type === 'TEA_STATION');
    if (teaStation) {
      spots.push({
        col: teaStation.col,
        row: teaStation.row + 1,
        breakType: 'tea',
        state: CharacterState.BREAK_COFFEE,
        dir: Direction.UP,
        isSitting: false,
      });
    }

    // 12. Microwave (microwave snack, standing facing UP)
    const microwave = this.layout.furniture.find((f) => f.type === 'MICROWAVE');
    if (microwave) {
      spots.push({
        col: microwave.col,
        row: microwave.row + 1,
        breakType: 'snack',
        state: CharacterState.BREAK_SNACK,
        dir: Direction.UP,
        isSitting: false,
      });
    }

    // 13. Kitchen Snack Bar (croissant & fruit, standing facing UP)
    const snackBar = this.layout.furniture.find((f) => f.type === 'KITCHEN_SNACK_BAR');
    if (snackBar) {
      spots.push({
        col: snackBar.col,
        row: snackBar.row + 1,
        breakType: 'snack',
        state: CharacterState.BREAK_SNACK,
        dir: Direction.UP,
        isSitting: false,
      });
    }

    // Fallback if layout is custom or has different furniture
    if (spots.length < 5 && this.walkableTiles.length > 0) {
      const validWalkable = this.walkableTiles.filter((t) => this.isBreakRoomArea(t.col, t.row));
      const pool = validWalkable.length >= 5 ? validWalkable : this.walkableTiles;
      const bTypes: Array<'coffee' | 'tea' | 'snack' | 'steamdeck'> = [
        'steamdeck',
        'coffee',
        'tea',
        'snack',
      ];
      const bStates = [
        CharacterState.BREAK_STEAMDECK,
        CharacterState.BREAK_COFFEE,
        CharacterState.BREAK_COFFEE,
        CharacterState.BREAK_SNACK,
      ];
      for (const t of pool) {
        if (!spots.some((s) => s.col === t.col && s.row === t.row)) {
          const idx = spots.length % 4;
          spots.push({
            col: t.col,
            row: t.row,
            breakType: bTypes[idx],
            state: bStates[idx],
            dir: Direction.DOWN,
            isSitting: false,
          });
        }
        if (spots.length >= 6) break;
      }
    }

    return spots;
  }

  /**
   * Enforces strictly ONE Project Lead per team / office:
   * - Finds the single designated Project Lead (prioritizing non-subagent active chat agent)
   * - Ensures exactly that agent has isTeamLead = true and role = 'Lead'
   * - Demotes any other agent to isTeamLead = false, and if role was 'Lead', changes to 'Teammate'
   * - Re-links subagents to this lead
   */
  sanitizeTeamHierarchy(): void {
    const chars = Array.from(this.characters.values());
    if (chars.length === 0) return;

    const lead =
      chars.find((c) => c.isTeamLead && !c.isSubagent) ||
      chars.find((c) => c.isTeamLead) ||
      chars.find((c) => !c.isSubagent) ||
      chars[0];

    if (!lead) return;

    lead.isTeamLead = true;
    lead.role = 'Lead';
    lead.isSubagent = false;

    for (const [id, ch] of this.characters.entries()) {
      if (id !== lead.id) {
        ch.isTeamLead = false;
        if (ch.role === 'Lead') {
          ch.role = 'Teammate';
          updateAgentProfile(id, { role: 'Teammate' });
        }
        if (ch.isSubagent) {
          ch.leadAgentId = lead.id;
          ch.parentAgentId = lead.id;
          ch.spawnedByName = lead.customName || 'Project Lead';
        }
      }
    }
  }

  /**
   * Engages a random number of workers (1-2) from the team to assist the Lead with
   * reasoning, system planning, or architecture analysis during the chat turn.
   */
  startTeamReasoning(leadId: number): number[] {
    const leadCh = this.characters.get(leadId);
    if (!leadCh) return [];

    const workers = Array.from(this.characters.entries()).filter(
      ([, ch]) => ch.isSubagent && (ch.leadAgentId === leadId || ch.parentAgentId === leadId),
    );
    if (workers.length === 0) return [];

    const freeWorkers = workers.filter(([, ch]) => ch.isTakingBreak);
    if (freeWorkers.length === 0) return [];

    const countToEngage = Math.min(freeWorkers.length, 1 + Math.floor(Math.random() * 2));
    const shuffled = [...freeWorkers].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, countToEngage);

    const reasoningRoles: UsefulWorkerRole[] = [
      'Software Architect',
      'Researcher',
      'Code Reviewer',
    ];
    const engagedIds: number[] = [];

    for (let i = 0; i < chosen.length; i++) {
      const [workerId, workerCh] = chosen[i];
      const assignedRole = reasoningRoles[i % reasoningRoles.length];
      workerCh.role = assignedRole;
      workerCh.currentOrder = `Reasoning & planning system directives (${assignedRole})`;
      workerCh.isTakingBreak = false;
      workerCh.breakType = null;
      workerCh.isActive = true;

      if (workerCh.seatId) {
        const seat = this.seats.get(workerCh.seatId);
        if (seat) {
          const path = this.withOwnSeatUnblocked(workerCh, () =>
            findPath(
              workerCh.tileCol,
              workerCh.tileRow,
              seat.seatCol,
              seat.seatRow,
              this.tileMap,
              this.blockedTiles,
            ),
          );
          if (path.length > 0) {
            workerCh.path = path;
            workerCh.moveProgress = 0;
            workerCh.state = CharacterState.WALK;
            workerCh.isSitting = false;
          } else {
            workerCh.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
            workerCh.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
            workerCh.tileCol = seat.seatCol;
            workerCh.tileRow = seat.seatRow;
            workerCh.dir = seat.facingDir;
            workerCh.state = CharacterState.TYPE;
          }
        } else {
          workerCh.state = CharacterState.TYPE;
        }
      } else {
        workerCh.state = CharacterState.TYPE;
      }

      this.addTeamDialogue({
        fromAgentId: leadId,
        fromName: leadCh.customName || 'Project Lead',
        fromRole: 'Lead',
        toAgentId: workerId,
        toName: workerCh.customName || `Worker #${workerId}`,
        toRole: assignedRole,
        text: `@${workerCh.customName}: Brainstorming implementation strategy as ${assignedRole}.`,
        context: 'delegation',
      });

      this.addTeamDialogue({
        fromAgentId: workerId,
        fromName: workerCh.customName || `Worker #${workerId}`,
        fromRole: assignedRole,
        toAgentId: leadId,
        toName: leadCh.customName || 'Project Lead',
        toRole: 'Lead',
        text: `Analyzing requirements, architectural specs, and constraints.`,
        context: 'delegation',
      });

      engagedIds.push(workerId);
    }

    return engagedIds;
  }

  /**
   * Returns all idle workers belonging to this lead back to the Break Room lounge.
   */
  returnAllTeamWorkersToBreak(leadId: number): void {
    const activeSubIds = new Set(this.subagentIdMap.values());
    const breakSpots = this.getBreakRoomSpots();
    let spotIdx = 0;

    for (const [id, ch] of this.characters.entries()) {
      if (
        ch.isSubagent &&
        (ch.leadAgentId === leadId || ch.parentAgentId === leadId) &&
        !activeSubIds.has(id) &&
        !ch.isTakingBreak
      ) {
        const spot = breakSpots[spotIdx % breakSpots.length];
        spotIdx++;
        ch.isTakingBreak = true;
        ch.isSitting = spot.isSitting;
        ch.breakType = spot.breakType;
        ch.state = spot.state;
        ch.dir = spot.dir;
        ch.role = 'Teammate';
        ch.currentOrder = null;
        ch.isActive = false;
        ch.breakTargetCol = spot.col;
        ch.breakTargetRow = spot.row;
        const path = this.withOwnSeatUnblocked(ch, () =>
          findPath(ch.tileCol, ch.tileRow, spot.col, spot.row, this.tileMap, this.blockedTiles),
        );
        if (path.length > 0) {
          ch.path = path;
          ch.moveProgress = 0;
          ch.state = CharacterState.WALK;
          ch.isSitting = false;
          ch.pendingBreakSpot = spot;
        } else {
          ch.x = spot.col * TILE_SIZE + TILE_SIZE / 2;
          ch.y = spot.row * TILE_SIZE + TILE_SIZE / 2;
          ch.tileCol = spot.col;
          ch.tileRow = spot.row;
          ch.path = [];
        }
      }
    }
  }

  ensureSubagentTeam(leadId: number, count = 5): number[] {
    const leadCh = this.characters.get(leadId);
    if (!leadCh) return [];

    leadCh.isTeamLead = true;
    leadCh.role = 'Lead';
    leadCh.isSubagent = false;

    // 1. Ensure strictly ONE Team Lead in the office — remove any old leads from past chats
    for (const [id, ch] of this.characters.entries()) {
      if (id !== leadId) {
        if (!ch.isSubagent) {
          if (ch.seatId) {
            const seat = this.seats.get(ch.seatId);
            if (seat) seat.assigned = false;
          }
          this.characters.delete(id);
          removeCopilotPixelAgent(id);
        } else {
          ch.isTeamLead = false;
          if (ch.role === 'Lead') {
            ch.role = 'Teammate';
          }
        }
      }
    }

    // 2. Position the active Team Lead at a workstation in Room 1 (NOT on break)
    if (leadCh.seatId) {
      const seat = this.seats.get(leadCh.seatId);
      if (seat && !this.isBreakRoomArea(seat.seatCol, seat.seatRow)) {
        leadCh.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
        leadCh.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
        leadCh.tileCol = seat.seatCol;
        leadCh.tileRow = seat.seatRow;
        leadCh.dir = seat.facingDir;
        leadCh.state = CharacterState.IDLE;
        leadCh.isSitting = false;
        leadCh.isTakingBreak = false;
      }
    }

    // 3. Collect ALL existing subagents and re-link them to this active lead
    const existingSubs: number[] = [];
    for (const [id, ch] of this.characters.entries()) {
      if (ch.isSubagent && id !== leadId) {
        ch.isTeamLead = false;
        if (ch.role === 'Lead') {
          ch.role = 'Teammate';
        }
        ch.leadAgentId = leadId;
        ch.parentAgentId = leadId;
        ch.spawnedByName = leadCh.customName || 'Project Lead';
        existingSubs.push(id);
      }
    }

    // 4. Prune any excess subagents beyond count (strictly 5 workers)
    if (existingSubs.length > count) {
      const toRemove = existingSubs.slice(count);
      for (const rId of toRemove) {
        const rCh = this.characters.get(rId);
        if (rCh && rCh.seatId) {
          const seat = this.seats.get(rCh.seatId);
          if (seat) seat.assigned = false;
        }
        this.characters.delete(rId);
        removeCopilotPixelAgent(rId);
      }
      existingSubs.length = count;
    }

    const breakSpots = this.getBreakRoomSpots();

    // 5. Create missing workers if fewer than count
    const needed = count - existingSubs.length;
    for (let i = 0; i < needed; i++) {
      const idx = existingSubs.length + i;
      const workerName = WORKER_NAMES[idx % WORKER_NAMES.length];
      const subId = this.nextSubagentId--;

      const palette = (leadCh.palette + 1 + idx) % 6;
      const hueShift = 0;

      // Assign a workstation seat for future work tasks (room 1)
      const seatId = this.findFreeSeat(leadCh.folderName);
      const seat = seatId ? (this.seats.get(seatId) ?? null) : null;
      if (seat) seat.assigned = true;

      const spot = breakSpots[idx % breakSpots.length];

      const ch = createCharacter(subId, palette, seatId, seat, hueShift);
      ch.customName = workerName;
      ch.role = 'Teammate';
      ch.isSubagent = true;
      ch.leadAgentId = leadId;
      ch.parentAgentId = leadId;
      ch.spawnedByName = leadCh.customName || 'Project Lead';
      ch.isCopilotPixelAgent = true;

      // Position directly at break spot inside the Break Room
      ch.x = spot.col * TILE_SIZE + TILE_SIZE / 2;
      ch.y = spot.row * TILE_SIZE + TILE_SIZE / 2;
      ch.tileCol = spot.col;
      ch.tileRow = spot.row;
      ch.dir = spot.dir;
      ch.state = spot.state;
      ch.isTakingBreak = true;
      ch.isSitting = spot.isSitting;
      ch.breakType = spot.breakType;
      ch.breakTargetCol = spot.col;
      ch.breakTargetRow = spot.row;
      ch.breakStartTime = Date.now();
      ch.breakDuration = 0;
      ch.path = [];
      ch.hueShift = 0;

      this.characters.set(subId, ch);

      saveOrUpdateCopilotPixelAgent({
        id: subId,
        customName: ch.customName,
        role: ch.role,
        palette: ch.palette,
        hueShift: 0,
        seatId: ch.seatId,
        isSubagent: true,
        parentAgentId: leadId,
        leadAgentId: leadId,
        isTakingBreak: true,
        isSitting: ch.isSitting,
        breakType: spot.breakType,
      });

      existingSubs.push(subId);
    }

    // 6. Ensure all 5 workers without an active order are situated in the Break Room!
    for (let i = 0; i < existingSubs.length; i++) {
      const sId = existingSubs[i];
      const sub = this.characters.get(sId);
      if (sub && (!sub.currentOrder || sub.orderStatus !== 'running')) {
        const spot = breakSpots[i % breakSpots.length];
        sub.isTakingBreak = true;
        sub.isSitting = spot.isSitting;
        sub.breakType = spot.breakType;
        sub.state = spot.state;
        sub.dir = spot.dir;
        sub.breakTargetCol = spot.col;
        sub.breakTargetRow = spot.row;
        sub.x = spot.col * TILE_SIZE + TILE_SIZE / 2;
        sub.y = spot.row * TILE_SIZE + TILE_SIZE / 2;
        sub.tileCol = spot.col;
        sub.tileRow = spot.row;
        sub.path = [];
        sub.hueShift = 0;
      }
    }

    if (needed > 0) {
      const names = existingSubs.map((id) => this.characters.get(id)?.customName).filter(Boolean);
      this.addTeamDialogue({
        fromAgentId: leadId,
        fromName: leadCh.customName || 'Project Lead',
        fromRole: 'Lead',
        text: `Team of 5 workers (${names.join(', ')}) stationed in the Break Room (sofas, espresso machine, tea station).`,
        context: 'break_room',
      });
    }

    this.sanitizeTeamHierarchy();
    return existingSubs;
  }

  getCharacterAt(worldX: number, worldY: number): number | null {
    const chars = Array.from(this.characters.values()).sort((a, b) => b.y - a.y);
    for (const ch of chars) {
      // Skip characters that are despawning
      if (ch.matrixEffect === 'despawn') continue;
      // Character sprite is 16x24, anchored bottom-center
      // Apply sitting offset to match visual position
      const sittingOffset =
        ch.state === CharacterState.TYPE || ch.isSitting ? CHARACTER_SITTING_OFFSET_PX : 0;
      const anchorY = ch.y + sittingOffset;
      const left = ch.x - CHARACTER_HIT_HALF_WIDTH;
      const right = ch.x + CHARACTER_HIT_HALF_WIDTH;
      const top = anchorY - CHARACTER_HIT_HEIGHT;
      const bottom = anchorY;
      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        return ch.id;
      }
    }
    return null;
  }

  /**
   * Lead Agent Mentoring Patrol & Pep Talks.
   * When it's time to work, the lead agent doesn't sit at a desk typing.
   * Instead, the lead walks between the PC workstations, inspecting progress,
   * instructing teammates, and giving fun motivational pep talks in speech bubbles.
   */
  updateLeadMentoring(dt: number): void {
    const lead = Array.from(this.characters.values()).find((c) => c.isTeamLead);
    if (!lead) return;

    // Is there active work happening in the office?
    const hasActiveWork =
      lead.isActive ||
      Array.from(this.characters.values()).some(
        (c) =>
          !c.isTeamLead &&
          (c.isActive ||
            (c.speechBubbleText && (c.speechBubbleTimer ?? 0) > 0) ||
            c.orderStatus === 'running'),
      );

    if (!hasActiveWork) {
      this.leadMentoringTimer = 0;
      return;
    }

    // Lead never sits and types while the team is working!
    lead.isSitting = false;
    if (lead.state === CharacterState.TYPE) {
      lead.state = CharacterState.IDLE;
    }

    this.leadMentoringTimer = (this.leadMentoringTimer || 0) + dt;

    // Periodically walk around the PC workstations and give fun pep talks
    if (this.leadMentoringTimer >= 7 && lead.path.length === 0) {
      this.leadMentoringTimer = 0;

      // Find workstation desk seats outside the break room
      const deskSeats = Array.from(this.seats.values()).filter(
        (s) => !this.isBreakRoomArea(s.seatCol, s.seatRow),
      );

      if (deskSeats.length > 0) {
        const targetSeat = deskSeats[Math.floor(Math.random() * deskSeats.length)];
        const candidates = [
          { col: targetSeat.seatCol + 1, row: targetSeat.seatRow },
          { col: targetSeat.seatCol - 1, row: targetSeat.seatRow },
          { col: targetSeat.seatCol, row: targetSeat.seatRow + 1 },
          { col: targetSeat.seatCol, row: targetSeat.seatRow - 1 },
        ].filter(
          (n) =>
            isWalkable(n.col, n.row, this.tileMap, this.blockedTiles) &&
            !(n.col === targetSeat.seatCol && n.row === targetSeat.seatRow),
        );

        if (candidates.length > 0) {
          const targetTile = candidates[Math.floor(Math.random() * candidates.length)];
          const path = findPath(
            lead.tileCol,
            lead.tileRow,
            targetTile.col,
            targetTile.row,
            this.tileMap,
            this.blockedTiles,
          );
          if (path.length > 0) {
            lead.path = path;
            lead.moveProgress = 0;
            lead.state = CharacterState.WALK;
            lead.isSitting = false;
          }
        }
      }

      // Fun motivational pep talk
      const LEAD_PEP_TALKS = [
        'Keep up the momentum, team! 🚀',
        'Loving the clean code over here! 💻',
        'Ship it once tests are green! ✅',
        'Great architecture on this module!',
        'Looking sharp, team! Keep pushing! 🔥',
        'Remember: commit early, commit clean!',
        'That logic is looking solid! 🧠',
        'You got this, fantastic progress!',
        'Teamwork makes the dream work! ✨',
        'Coffee check! Stay hydrated and energized! ☕',
        'Excellent progress on this task!',
        'That refactor looks super clean! 🧼',
        "High five! Let's get this done! 🙌",
      ];
      const pepTalk = LEAD_PEP_TALKS[Math.floor(Math.random() * LEAD_PEP_TALKS.length)];
      lead.speechBubbleText = pepTalk;
      lead.speechBubbleTimer = 4.0;
      this.addTeamDialogue({
        fromAgentId: lead.id,
        fromName: lead.customName || 'Dallas',
        fromRole: 'Lead',
        text: pepTalk,
        context: 'chat',
      });
    }
  }
}
