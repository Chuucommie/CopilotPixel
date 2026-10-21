import {
  BREAK_COFFEE_LIQUID_COLOR,
  BREAK_COFFEE_MUG_COLOR,
  BREAK_COFFEE_MUG_SHADOW,
  BREAK_COFFEE_STEAM_COLOR_1,
  BREAK_COFFEE_STEAM_COLOR_2,
  BREAK_HAND_COLOR,
  BREAK_HAND_SHADOW_COLOR,
  BREAK_SNACK_BASE_COLOR,
  BREAK_SNACK_CRUMB_COLOR,
  BREAK_SNACK_FROSTING_COLOR,
  BREAK_SNACK_SPRINKLE_COLOR,
  BREAK_STEAMDECK_BODY_COLOR,
  BREAK_STEAMDECK_BUTTON_COLOR,
  BREAK_STEAMDECK_COIN_COLOR,
  BREAK_STEAMDECK_ENEMY_COLOR,
  BREAK_STEAMDECK_HERO_COLOR,
  BREAK_STEAMDECK_SCREEN_ON_1,
  BREAK_STEAMDECK_SCREEN_ON_2,
  BREAK_STEAMDECK_SLASH_COLOR,
  BREAK_STEAMDECK_VICTORY_COLOR,
  BREAK_TEA_CUP_COLOR,
  BREAK_TEA_LIQUID_COLOR,
  BREAK_TEA_SHADOW_COLOR,
  BREAK_TEA_TAG_COLOR,
  DEFAULT_MAX_CONTEXT_TOKENS,
  KITCHEN_SINK_WATER_FOAM,
  KITCHEN_SINK_WATER_SPLASH,
  SEAT_REST_MAX_SEC,
  SEAT_REST_MIN_SEC,
  TYPE_FRAME_DURATION_SEC,
  WALK_FRAME_DURATION_SEC,
  WALK_SPEED_PX_PER_SEC,
  WANDER_MOVES_BEFORE_REST_MAX,
  WANDER_MOVES_BEFORE_REST_MIN,
  WANDER_PAUSE_MAX_SEC,
  WANDER_PAUSE_MIN_SEC,
} from '../../constants.js';
import { isE2E } from '../../runtime.js';
import { findPath } from '../layout/tileMap.js';
import type { CharacterSprites } from '../sprites/spriteData.js';
import { isReadingToolName } from '../toolUtils.js';
import type { Character, Seat, SpriteData, TileType as TileTypeVal } from '../types.js';
import { CharacterState, Direction, TILE_SIZE } from '../types.js';

/** Whether a tool should show the reading animation (vs typing). Taxonomy comes
 *  from the active HookProvider via the `providerCapabilities` message. */
export function isReadingTool(tool: string | null): boolean {
  if (!tool) return false;
  return isReadingToolName(tool);
}

/** Pixel center of a tile */
function tileCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  };
}

/** Direction from one tile to an adjacent tile */
function directionBetween(
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
): Direction {
  const dc = toCol - fromCol;
  const dr = toRow - fromRow;
  if (dc > 0) return Direction.RIGHT;
  if (dc < 0) return Direction.LEFT;
  if (dr > 0) return Direction.DOWN;
  return Direction.UP;
}

export function createCharacter(
  id: number,
  palette: number,
  seatId: string | null,
  seat: Seat | null,
  hueShift = 0,
): Character {
  const col = seat ? seat.seatCol : 14;
  const row = seat ? seat.seatRow : 15;
  const center = tileCenter(col, row);
  return {
    id,
    state: CharacterState.TYPE,
    dir: seat ? seat.facingDir : Direction.DOWN,
    x: center.x,
    y: center.y,
    tileCol: col,
    tileRow: row,
    path: [],
    moveProgress: 0,
    currentTool: null,
    palette,
    hueShift,
    frame: 0,
    frameTimer: 0,
    wanderTimer: 0,
    wanderCount: 0,
    wanderLimit: randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX),
    isActive: true,
    isSitting: seat !== null,
    seatId,
    bubbleType: null,
    bubbleTimer: 0,
    seatTimer: 0,
    isSubagent: false,
    parentAgentId: null,
    matrixEffect: null,
    matrixEffectTimer: 0,
    matrixEffectSeeds: [],
    customName: undefined,
    role: undefined,
    currentOrder: null,
    orderHistory: [],
    delegatedFrom: null,
    orderStatus: null,
    orderProgressMessage: null,
    orderModelName: null,
    contextTokens: 0,
    maxContextTokens: DEFAULT_MAX_CONTEXT_TOKENS,
  };
}

/** Places held coffee cup on the adjacent workstation desk */
export function placeCoffeeOnWorkstation(ch: Character, seat: Seat): void {
  let deskCol = ch.tileCol;
  let deskRow = ch.tileRow;
  let offX = 8;
  let offY = 8;
  switch (seat.facingDir) {
    case Direction.UP:
      deskRow = ch.tileRow - 1;
      offX = 10;
      offY = 8;
      break;
    case Direction.DOWN:
      deskRow = ch.tileRow + 1;
      offX = 10;
      offY = 4;
      break;
    case Direction.LEFT:
      deskCol = ch.tileCol - 1;
      offX = 10;
      offY = 8;
      break;
    case Direction.RIGHT:
      deskCol = ch.tileCol + 1;
      offX = 4;
      offY = 8;
      break;
  }
  ch.placedCoffee = {
    agentId: ch.id,
    col: deskCol,
    row: deskRow,
    pixelOffsetX: offX,
    pixelOffsetY: offY,
    state: ch.coffeeCupState === 'empty' ? 'empty' : 'full',
    timer: 45,
  };
  ch.hasCoffeeCup = false;
}

/** Places held coffee cup on adjacent break room table or coffee table */
export function placeCoffeeOnBreakTable(ch: Character): void {
  let tableCol = ch.tileCol;
  let tableRow = ch.tileRow;
  let offX = 8;
  let offY = 8;
  switch (ch.dir) {
    case Direction.RIGHT:
      tableCol = ch.tileCol + 1;
      offX = 3;
      offY = 7;
      break;
    case Direction.LEFT:
      tableCol = ch.tileCol - 1;
      offX = 9;
      offY = 7;
      break;
    case Direction.DOWN:
      tableRow = ch.tileRow + 1;
      offX = 7;
      offY = 3;
      break;
    case Direction.UP:
      tableRow = ch.tileRow - 1;
      offX = 7;
      offY = 9;
      break;
  }
  // Align with central coffee table at cols 16-17, rows 15-16
  if (ch.tileCol === 14 && ch.tileRow === 16) {
    tableCol = 16;
    tableRow = 16;
    offX = 3;
    offY = 7;
  } else if (ch.tileCol === 19 && ch.tileRow === 16) {
    tableCol = 17;
    tableRow = 16;
    offX = 9;
    offY = 7;
  } else if (ch.tileCol === 16 && ch.tileRow === 14) {
    tableCol = 16;
    tableRow = 15;
    offX = 8;
    offY = 3;
  }

  ch.placedCoffee = {
    agentId: ch.id,
    col: tableCol,
    row: tableRow,
    pixelOffsetX: offX,
    pixelOffsetY: offY,
    state: ch.coffeeCupState === 'empty' ? 'empty' : 'full',
    timer: 35,
  };
  ch.hasCoffeeCup = false;
}

export function updateCharacter(
  ch: Character,
  dt: number,
  walkableTiles: Array<{ col: number; row: number }>,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): void {
  ch.frameTimer += dt;

  switch (ch.state) {
    case CharacterState.TYPE: {
      const seatAtTile = Array.from(seats.values()).find(
        (s) => s.seatCol === ch.tileCol && s.seatRow === ch.tileRow,
      );
      if (seatAtTile) {
        ch.isSitting = true;
        ch.dir = seatAtTile.facingDir;
      }
      // The Team Lead does NOT type at a workstation like a regular worker
      if (!isE2E && ch.isTeamLead) {
        ch.state = CharacterState.IDLE;
        break;
      }
      const seat = seatAtTile ?? (ch.seatId ? seats.get(ch.seatId) : null);
      if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
        ch.isSitting = true;
        ch.dir = seat.facingDir;
        if (ch.hasCoffeeCup) {
          placeCoffeeOnWorkstation(ch, seat);
        }
      }
      if (ch.frameTimer >= TYPE_FRAME_DURATION_SEC) {
        ch.frameTimer -= TYPE_FRAME_DURATION_SEC;
        ch.frame = (ch.frame + 1) % 2;
      }
      // If character is taking a break, it should NEVER type at a PC workstation!
      if (ch.isTakingBreak) {
        if (ch.breakType === 'tea' || ch.breakType === 'coffee')
          ch.state = CharacterState.BREAK_COFFEE;
        else if (ch.breakType === 'snack') ch.state = CharacterState.BREAK_SNACK;
        else if (ch.breakType === 'steamdeck') ch.state = CharacterState.BREAK_STEAMDECK;
        else ch.state = CharacterState.BREAK_COFFEE;
        ch.frame = 0;
        ch.frameTimer = 0;
        break;
      }
      // If no longer active, stand up and start wandering (after seatTimer expires)
      if (!ch.isActive) {
        if (ch.seatTimer > 0) {
          ch.seatTimer -= dt;
          break;
        }
        ch.seatTimer = 0; // clear sentinel
        ch.state = CharacterState.IDLE;
        if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
          ch.isSitting = true;
          ch.dir = seat.facingDir;
        }
        ch.frame = 0;
        ch.frameTimer = 0;
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
        ch.wanderCount = 0;
        ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX);
      }
      break;
    }

    case CharacterState.IDLE: {
      const seatAtTile = Array.from(seats.values()).find(
        (s) => s.seatCol === ch.tileCol && s.seatRow === ch.tileRow,
      );
      const seat = seatAtTile ?? (ch.seatId ? seats.get(ch.seatId) : null);
      if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
        ch.isSitting = true;
        ch.dir = seat.facingDir;
        if (ch.hasCoffeeCup) {
          if (ch.isTakingBreak) {
            placeCoffeeOnBreakTable(ch);
          } else {
            placeCoffeeOnWorkstation(ch, seat);
          }
        }
      }
      // No idle animation — static pose
      ch.frame = 0;
      if (ch.seatTimer < 0) ch.seatTimer = 0; // clear turn-end sentinel
      // If became active, pathfind to seat
      if (ch.isActive) {
        if (!isE2E && ch.isTeamLead) {
          if (seatAtTile) {
            ch.isSitting = true;
            ch.dir = seatAtTile.facingDir;
          }
          // Team lead observes from seat/spot without locking into TYPE loop
        } else if (!ch.seatId) {
          // No seat assigned — type in place
          ch.state = CharacterState.TYPE;
          ch.frame = 0;
          ch.frameTimer = 0;
          break;
        } else {
          const seat = seats.get(ch.seatId);
          if (seat) {
            const path = findPath(
              ch.tileCol,
              ch.tileRow,
              seat.seatCol,
              seat.seatRow,
              tileMap,
              blockedTiles,
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
              ch.isSitting = true;
              ch.frame = 0;
              ch.frameTimer = 0;
            }
          }
          break;
        }
      }
      // Countdown wander timer
      ch.wanderTimer -= dt;
      if (ch.wanderTimer <= 0) {
        // Characters on break NEVER return to workstation seat!
        if (ch.isTakingBreak) {
          // If not at break target, walk to it; otherwise resume break animation
          if (
            ch.breakTargetCol &&
            ch.breakTargetRow &&
            (ch.tileCol !== ch.breakTargetCol || ch.tileRow !== ch.breakTargetRow)
          ) {
            const path = findPath(
              ch.tileCol,
              ch.tileRow,
              ch.breakTargetCol,
              ch.breakTargetRow,
              tileMap,
              blockedTiles,
            );
            if (path.length > 0) {
              ch.path = path;
              ch.moveProgress = 0;
              ch.state = CharacterState.WALK;
              ch.frame = 0;
              ch.frameTimer = 0;
              break;
            }
          }
          if (ch.breakType === 'tea' || ch.breakType === 'coffee')
            ch.state = CharacterState.BREAK_COFFEE;
          else if (ch.breakType === 'snack') ch.state = CharacterState.BREAK_SNACK;
          else if (ch.breakType === 'steamdeck') ch.state = CharacterState.BREAK_STEAMDECK;
          else ch.state = CharacterState.BREAK_COFFEE;
          ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
          break;
        }

        // Check if we've wandered enough — return to seat for a rest
        if (ch.wanderCount >= ch.wanderLimit && ch.seatId) {
          const seat = seats.get(ch.seatId);
          if (seat) {
            const path = findPath(
              ch.tileCol,
              ch.tileRow,
              seat.seatCol,
              seat.seatRow,
              tileMap,
              blockedTiles,
            );
            if (path.length > 0) {
              ch.path = path;
              ch.moveProgress = 0;
              ch.state = CharacterState.WALK;
              ch.frame = 0;
              ch.frameTimer = 0;
              break;
            }
          }
        }
        if (walkableTiles.length > 0) {
          const target = walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
          const path = findPath(
            ch.tileCol,
            ch.tileRow,
            target.col,
            target.row,
            tileMap,
            blockedTiles,
          );
          if (path.length > 0) {
            ch.path = path;
            ch.moveProgress = 0;
            ch.state = CharacterState.WALK;
            ch.frame = 0;
            ch.frameTimer = 0;
            ch.wanderCount++;
          }
        }
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
      }
      break;
    }

    case CharacterState.WALK: {
      ch.isSitting = false;
      // Walk animation
      if (ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
        ch.frameTimer -= WALK_FRAME_DURATION_SEC;
        ch.frame = (ch.frame + 1) % 4;
      }

      if (ch.path.length === 0) {
        // Path complete — snap to tile center and transition
        const center = tileCenter(ch.tileCol, ch.tileRow);
        ch.x = center.x;
        ch.y = center.y;

        if (ch.isTakingBreak) {
          if (ch.pendingBreakSpot) {
            const pending = ch.pendingBreakSpot;
            ch.state = pending.state;
            ch.dir = pending.dir;
            ch.breakType = pending.breakType;
            ch.isSitting = pending.isSitting;
            ch.breakTargetCol = pending.col;
            ch.breakTargetRow = pending.row;
            ch.pendingBreakSpot = null;
            if (ch.hasCoffeeCup && ch.isSitting) {
              placeCoffeeOnBreakTable(ch);
            }
          } else {
            const seatAtTile = Array.from(seats.values()).find(
              (s) => s.seatCol === ch.tileCol && s.seatRow === ch.tileRow,
            );
            if (seatAtTile) {
              ch.isSitting = true;
              ch.dir = seatAtTile.facingDir;
            }
            if (ch.breakType === 'coffee') ch.state = CharacterState.BREAK_COFFEE;
            else if (ch.breakType === 'snack') ch.state = CharacterState.BREAK_SNACK;
            else if (ch.breakType === 'steamdeck') ch.state = CharacterState.BREAK_STEAMDECK;
            else ch.state = CharacterState.BREAK_COFFEE;
          }
          ch.frame = 0;
          ch.frameTimer = 0;
          break;
        }

        const seatAtTile = Array.from(seats.values()).find(
          (s) => s.seatCol === ch.tileCol && s.seatRow === ch.tileRow,
        );
        if (ch.isActive) {
          if (!ch.seatId) {
            // No seat — type in place
            ch.state = CharacterState.TYPE;
          } else if (seatAtTile) {
            ch.state = !isE2E && ch.isTeamLead ? CharacterState.IDLE : CharacterState.TYPE;
            ch.dir = seatAtTile.facingDir;
            ch.isSitting = true;
            if (ch.hasCoffeeCup) {
              placeCoffeeOnWorkstation(ch, seatAtTile);
            }
          } else {
            ch.isSitting = false;
            ch.state = CharacterState.IDLE;
          }
        } else {
          // Check if arrived at any seat — sit down for a rest before wandering again
          if (seatAtTile) {
            ch.state = !isE2E && ch.isTeamLead ? CharacterState.IDLE : CharacterState.TYPE;
            ch.dir = seatAtTile.facingDir;
            ch.isSitting = true;
            if (ch.hasCoffeeCup) {
              placeCoffeeOnWorkstation(ch, seatAtTile);
            }
            if (ch.seatTimer < 0) {
              ch.seatTimer = 0;
            } else {
              ch.seatTimer = randomRange(SEAT_REST_MIN_SEC, SEAT_REST_MAX_SEC);
            }
            ch.wanderCount = 0;
            ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX);
            ch.frame = 0;
            ch.frameTimer = 0;
            break;
          }
          ch.isSitting = false;
          ch.state = CharacterState.IDLE;
          ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
        }
        ch.frame = 0;
        ch.frameTimer = 0;
        break;
      }

      // Move toward next tile in path
      const nextTile = ch.path[0];
      ch.dir = directionBetween(ch.tileCol, ch.tileRow, nextTile.col, nextTile.row);

      ch.moveProgress += (WALK_SPEED_PX_PER_SEC / TILE_SIZE) * dt;

      const fromCenter = tileCenter(ch.tileCol, ch.tileRow);
      const toCenter = tileCenter(nextTile.col, nextTile.row);
      const t = Math.min(ch.moveProgress, 1);
      ch.x = fromCenter.x + (toCenter.x - fromCenter.x) * t;
      ch.y = fromCenter.y + (toCenter.y - fromCenter.y) * t;

      if (ch.moveProgress >= 1) {
        // Arrived at next tile
        ch.tileCol = nextTile.col;
        ch.tileRow = nextTile.row;
        ch.x = toCenter.x;
        ch.y = toCenter.y;
        ch.path.shift();
        ch.moveProgress = 0;

        // Arrival at destination for break room wanderers
        if (ch.path.length === 0 && ch.isTakingBreak) {
          const pending = ch.pendingBreakSpot;
          if (pending) {
            ch.state = pending.state;
            ch.dir = pending.dir;
            ch.breakType = pending.breakType;
            ch.isSitting = pending.isSitting;
            ch.breakTargetCol = pending.col;
            ch.breakTargetRow = pending.row;
            ch.pendingBreakSpot = null;
            if (ch.hasCoffeeCup && ch.isSitting) {
              placeCoffeeOnBreakTable(ch);
            }
          } else {
            const seatAtTile = Array.from(seats.values()).find(
              (s) => s.seatCol === ch.tileCol && s.seatRow === ch.tileRow,
            );
            if (seatAtTile) {
              ch.isSitting = true;
              ch.dir = seatAtTile.facingDir;
            }
            if (ch.breakType === 'coffee' || ch.breakType === 'tea')
              ch.state = CharacterState.BREAK_COFFEE;
            else if (ch.breakType === 'snack') ch.state = CharacterState.BREAK_SNACK;
            else if (ch.breakType === 'steamdeck') ch.state = CharacterState.BREAK_STEAMDECK;
            else ch.state = CharacterState.BREAK_COFFEE;
          }
        }
      }

      // If became active while wandering, repath to seat
      if (!isE2E && ch.isTeamLead) {
        // Team lead does not interrupt mentoring/patrolling walk to rush back to seat!
      } else if (ch.isActive && ch.seatId) {
        const seat = seats.get(ch.seatId);
        if (seat) {
          const lastStep = ch.path[ch.path.length - 1];
          if (!lastStep || lastStep.col !== seat.seatCol || lastStep.row !== seat.seatRow) {
            const newPath = findPath(
              ch.tileCol,
              ch.tileRow,
              seat.seatCol,
              seat.seatRow,
              tileMap,
              blockedTiles,
            );
            if (newPath.length > 0) {
              ch.path = newPath;
              ch.moveProgress = 0;
            }
          }
        }
      }
      break;
    }

    case CharacterState.BREAK_COFFEE:
    case CharacterState.BREAK_SNACK:
    case CharacterState.BREAK_STEAMDECK: {
      if (ch.frameTimer >= 0.35) {
        ch.frameTimer -= 0.35;
        ch.frame = (ch.frame + 1) % 4;
      }
      if (ch.isActive && !ch.isTakingBreak) {
        if (ch.seatId) {
          const seat = seats.get(ch.seatId);
          if (seat) {
            const path = findPath(
              ch.tileCol,
              ch.tileRow,
              seat.seatCol,
              seat.seatRow,
              tileMap,
              blockedTiles,
            );
            if (path.length > 0) {
              ch.path = path;
              ch.moveProgress = 0;
              ch.state = CharacterState.WALK;
              break;
            }
          }
        }
        ch.state = CharacterState.TYPE;
      }
      break;
    }
  }
}

function cloneSprite(sprite: SpriteData): SpriteData {
  return sprite.map((row) => [...row]);
}

function flipSpriteHorizontal(sprite: SpriteData): SpriteData {
  return sprite.map((row) => [...row].reverse());
}

export interface CharacterColors {
  skin: string;
  shadow: string;
  sleeve: string;
  torso: string;
  pants: string;
}

/** Helper to extract dynamic character palette colors (skin, sleeve, torso, pants) */
export function extractCharacterColors(downStandSprite: SpriteData): CharacterColors {
  const skin =
    downStandSprite[14]?.[8] ||
    downStandSprite[13]?.[7] ||
    downStandSprite[14]?.[7] ||
    BREAK_HAND_COLOR;
  const shadow = downStandSprite[15]?.[8] || downStandSprite[15]?.[7] || BREAK_HAND_SHADOW_COLOR;
  const sleeve =
    downStandSprite[20]?.[3] ||
    downStandSprite[20]?.[12] ||
    downStandSprite[21]?.[2] ||
    downStandSprite[21]?.[13] ||
    skin;
  const torso = downStandSprite[20]?.[7] || downStandSprite[19]?.[7] || sleeve;
  const pants = downStandSprite[26]?.[7] || downStandSprite[27]?.[7] || torso;

  return { skin, shadow, sleeve, torso, pants };
}

/** Render a steaming coffee/tea mug with fully animated arms, sleeves, and sipping cycles */
function renderCoffeeBreakSprite(
  base: SpriteData,
  frame: number,
  dir: Direction,
  isTea = false,
  isSitting = false,
  isFull = true,
  colors: CharacterColors = {
    skin: BREAK_HAND_COLOR,
    shadow: BREAK_HAND_SHADOW_COLOR,
    sleeve: BREAK_HAND_COLOR,
    torso: BREAK_HAND_COLOR,
    pants: BREAK_HAND_COLOR,
  },
): SpriteData {
  if (dir === Direction.LEFT) {
    const flippedBase = flipSpriteHorizontal(base);
    const renderedRight = renderCoffeeBreakSprite(
      flippedBase,
      frame,
      Direction.RIGHT,
      isTea,
      isSitting,
      isFull,
      colors,
    );
    return flipSpriteHorizontal(renderedRight);
  }

  const sprite = cloneSprite(base);
  const rows = sprite.length;
  const cols = sprite[0]?.length ?? 0;
  if (rows < 24 || cols < 16) return sprite;

  const rowOffset = isSitting ? 1 : 0;
  const animPhase = frame % 4;
  const liquid = isTea ? BREAK_TEA_LIQUID_COLOR : BREAK_COFFEE_LIQUID_COLOR;
  const mug = isTea ? BREAK_TEA_CUP_COLOR : BREAK_COFFEE_MUG_COLOR;
  const shadow = isTea ? BREAK_TEA_SHADOW_COLOR : BREAK_COFFEE_MUG_SHADOW;
  const tag = isTea ? BREAK_TEA_TAG_COLOR : mug;

  if (dir === Direction.DOWN) {
    // 1. Clear static hanging arms/hands from base sprite sides so arms bend naturally
    for (let r = 21 + rowOffset; r <= 24 + rowOffset; r++) {
      if (sprite[r]) {
        sprite[r][1] = '';
        sprite[r][2] = '';
        sprite[r][3] = '';
        sprite[r][12] = '';
        sprite[r][13] = '';
        sprite[r][14] = '';
      }
    }
    if (sprite[23 + rowOffset]) {
      sprite[23 + rowOffset][3] = colors.torso;
      sprite[23 + rowOffset][12] = colors.torso;
    }

    if (animPhase === 0) {
      // Phase 0: Holding cup comfortably at chest
      const mugRow = 18 + rowOffset;
      if (sprite[mugRow] && sprite[mugRow + 1] && sprite[mugRow + 2]) {
        sprite[mugRow][7] = liquid;
        sprite[mugRow][8] = liquid;
        sprite[mugRow + 1][7] = mug;
        sprite[mugRow + 1][8] = mug;
        sprite[mugRow + 1][9] = tag;
        sprite[mugRow + 2][7] = shadow;
        sprite[mugRow + 2][8] = shadow;

        // Left arm: sleeve angles down-inward to hold cup
        sprite[20 + rowOffset][3] = colors.sleeve;
        sprite[21 + rowOffset][3] = colors.sleeve;
        sprite[21 + rowOffset][4] = colors.sleeve;
        sprite[21 + rowOffset][5] = colors.sleeve;
        sprite[20 + rowOffset][5] = colors.sleeve;
        sprite[19 + rowOffset][6] = colors.skin;
        sprite[20 + rowOffset][6] = colors.skin;

        // Right arm: sleeve angles down-inward to hold cup
        sprite[20 + rowOffset][12] = colors.sleeve;
        sprite[21 + rowOffset][12] = colors.sleeve;
        sprite[21 + rowOffset][11] = colors.sleeve;
        sprite[21 + rowOffset][10] = colors.sleeve;
        sprite[20 + rowOffset][10] = colors.sleeve;
        sprite[19 + rowOffset][9] = colors.skin;
        sprite[20 + rowOffset][9] = colors.skin;

        if (isFull && sprite[mugRow - 1]) {
          sprite[mugRow - 1][7] = BREAK_COFFEE_STEAM_COLOR_1;
        }
      }
    } else if (animPhase === 1 || animPhase === 3) {
      // Phase 1 & 3: Raising / Lowering cup - Transition
      const mugRow = 17 + rowOffset;
      if (sprite[mugRow] && sprite[mugRow + 1] && sprite[mugRow + 2]) {
        sprite[mugRow][7] = liquid;
        sprite[mugRow][8] = liquid;
        sprite[mugRow + 1][7] = mug;
        sprite[mugRow + 1][8] = mug;
        sprite[mugRow + 1][9] = tag;
        sprite[mugRow + 2][7] = shadow;
        sprite[mugRow + 2][8] = shadow;

        // Left arm: elbow bends up
        sprite[21 + rowOffset][3] = colors.sleeve;
        sprite[20 + rowOffset][3] = colors.sleeve;
        sprite[20 + rowOffset][4] = colors.sleeve;
        sprite[19 + rowOffset][4] = colors.sleeve;
        sprite[19 + rowOffset][5] = colors.sleeve;
        sprite[18 + rowOffset][6] = colors.skin;
        sprite[19 + rowOffset][6] = colors.shadow;

        // Right arm: elbow bends up
        sprite[21 + rowOffset][12] = colors.sleeve;
        sprite[20 + rowOffset][12] = colors.sleeve;
        sprite[20 + rowOffset][11] = colors.sleeve;
        sprite[19 + rowOffset][11] = colors.sleeve;
        sprite[19 + rowOffset][10] = colors.sleeve;
        sprite[18 + rowOffset][9] = colors.skin;
        sprite[19 + rowOffset][9] = colors.shadow;

        if (isFull) {
          if (sprite[mugRow - 1]) sprite[mugRow - 1][8] = BREAK_COFFEE_STEAM_COLOR_1;
          if (sprite[mugRow - 2]) sprite[mugRow - 2][7] = BREAK_COFFEE_STEAM_COLOR_2;
        }
      }
    } else {
      // Phase 2: Sipping! Cup raised right up to lips
      const mugRow = 16 + rowOffset;
      if (sprite[mugRow] && sprite[mugRow + 1] && sprite[mugRow + 2]) {
        sprite[mugRow][7] = liquid;
        sprite[mugRow][8] = liquid;
        sprite[mugRow + 1][7] = mug;
        sprite[mugRow + 1][8] = mug;
        sprite[mugRow + 1][9] = tag;
        sprite[mugRow + 2][7] = shadow;
        sprite[mugRow + 2][8] = shadow;

        // Left arm: sleeve raised high to support cup at mouth
        sprite[21 + rowOffset][3] = colors.sleeve;
        sprite[20 + rowOffset][3] = colors.sleeve;
        sprite[19 + rowOffset][4] = colors.sleeve;
        sprite[19 + rowOffset][5] = colors.sleeve;
        sprite[18 + rowOffset][5] = colors.sleeve;
        sprite[16 + rowOffset][6] = colors.skin;
        sprite[17 + rowOffset][6] = colors.skin;

        // Right arm: sleeve raised high to support cup at mouth
        sprite[21 + rowOffset][12] = colors.sleeve;
        sprite[20 + rowOffset][12] = colors.sleeve;
        sprite[19 + rowOffset][11] = colors.sleeve;
        sprite[19 + rowOffset][10] = colors.sleeve;
        sprite[18 + rowOffset][10] = colors.sleeve;
        sprite[16 + rowOffset][9] = colors.skin;
        sprite[17 + rowOffset][9] = colors.skin;

        // Content eyes closed while enjoying sip
        if (sprite[14 + rowOffset]) {
          sprite[14 + rowOffset][6] = colors.skin;
          sprite[14 + rowOffset][9] = colors.skin;
        }

        if (isFull) {
          if (sprite[mugRow - 1]) sprite[mugRow - 1][6] = BREAK_COFFEE_STEAM_COLOR_2;
          if (sprite[mugRow - 1]) sprite[mugRow - 1][9] = BREAK_COFFEE_STEAM_COLOR_1;
          if (sprite[mugRow - 2]) sprite[mugRow - 2][7] = BREAK_COFFEE_STEAM_COLOR_2;
        }
      }
    }
  } else if (dir === Direction.RIGHT) {
    // Clear front hanging arm from base sprite
    for (let r = 21 + rowOffset; r <= 24 + rowOffset; r++) {
      if (sprite[r]) {
        sprite[r][6] = colors.torso;
        sprite[r][7] = colors.torso;
        sprite[r][8] = '';
      }
    }

    if (animPhase === 0) {
      // Phase 0: Holding at chest
      const mugRow = 18 + rowOffset;
      if (sprite[mugRow] && sprite[mugRow + 1] && sprite[mugRow + 2]) {
        sprite[mugRow][10] = liquid;
        sprite[mugRow][11] = liquid;
        sprite[mugRow + 1][10] = mug;
        sprite[mugRow + 1][11] = mug;
        sprite[mugRow + 1][12] = tag;
        sprite[mugRow + 2][10] = shadow;
        sprite[mugRow + 2][11] = shadow;

        sprite[20 + rowOffset][6] = colors.sleeve;
        sprite[20 + rowOffset][7] = colors.sleeve;
        sprite[21 + rowOffset][7] = colors.sleeve;
        sprite[21 + rowOffset][8] = colors.sleeve;
        sprite[19 + rowOffset][9] = colors.skin;
        sprite[20 + rowOffset][9] = colors.skin;

        if (isFull && sprite[mugRow - 1]) {
          sprite[mugRow - 1][10] = BREAK_COFFEE_STEAM_COLOR_1;
        }
      }
    } else if (animPhase === 1 || animPhase === 3) {
      // Phase 1 & 3: Raising / Lowering
      const mugRow = 17 + rowOffset;
      if (sprite[mugRow] && sprite[mugRow + 1] && sprite[mugRow + 2]) {
        sprite[mugRow][10] = liquid;
        sprite[mugRow][11] = liquid;
        sprite[mugRow + 1][10] = mug;
        sprite[mugRow + 1][11] = mug;
        sprite[mugRow + 1][12] = tag;
        sprite[mugRow + 2][10] = shadow;
        sprite[mugRow + 2][11] = shadow;

        sprite[20 + rowOffset][6] = colors.sleeve;
        sprite[19 + rowOffset][7] = colors.sleeve;
        sprite[19 + rowOffset][8] = colors.sleeve;
        sprite[17 + rowOffset][9] = colors.skin;
        sprite[18 + rowOffset][9] = colors.shadow;

        if (isFull && sprite[mugRow - 1]) {
          sprite[mugRow - 1][11] = BREAK_COFFEE_STEAM_COLOR_1;
        }
      }
    } else {
      // Phase 2: Sipping at lips
      const mugRow = 15 + rowOffset;
      if (sprite[mugRow] && sprite[mugRow + 1] && sprite[mugRow + 2]) {
        sprite[mugRow][10] = liquid;
        sprite[mugRow][11] = liquid;
        sprite[mugRow + 1][10] = mug;
        sprite[mugRow + 1][11] = mug;
        sprite[mugRow + 1][12] = tag;
        sprite[mugRow + 2][10] = shadow;
        sprite[mugRow + 2][11] = shadow;

        sprite[20 + rowOffset][6] = colors.sleeve;
        sprite[19 + rowOffset][7] = colors.sleeve;
        sprite[18 + rowOffset][8] = colors.sleeve;
        sprite[15 + rowOffset][9] = colors.skin;
        sprite[16 + rowOffset][9] = colors.skin;

        if (isFull) {
          if (sprite[mugRow - 1]) sprite[mugRow - 1][10] = BREAK_COFFEE_STEAM_COLOR_2;
          if (sprite[mugRow - 2]) sprite[mugRow - 2][11] = BREAK_COFFEE_STEAM_COLOR_1;
        }
      }
    }
  } else if (dir === Direction.UP) {
    // Clear hanging arms visible from rear
    for (let r = 21 + rowOffset; r <= 24 + rowOffset; r++) {
      if (sprite[r]) {
        sprite[r][1] = '';
        sprite[r][2] = '';
        sprite[r][13] = '';
        sprite[r][14] = '';
      }
    }

    if (animPhase === 0 || animPhase === 3) {
      // Elbows bent forward holding cup in front
      sprite[20 + rowOffset][2] = colors.sleeve;
      sprite[21 + rowOffset][3] = colors.sleeve;
      sprite[20 + rowOffset][13] = colors.sleeve;
      sprite[21 + rowOffset][12] = colors.sleeve;

      if (isFull && sprite[16 + rowOffset]) {
        sprite[16 + rowOffset][7] = BREAK_COFFEE_STEAM_COLOR_1;
      }
    } else if (animPhase === 1) {
      // Elbows raising
      sprite[19 + rowOffset][2] = colors.sleeve;
      sprite[20 + rowOffset][3] = colors.sleeve;
      sprite[19 + rowOffset][13] = colors.sleeve;
      sprite[20 + rowOffset][12] = colors.sleeve;

      if (isFull && sprite[15 + rowOffset]) {
        sprite[15 + rowOffset][8] = BREAK_COFFEE_STEAM_COLOR_1;
      }
    } else {
      // Sipping: elbows flare higher, rim of cup & steam visible over head
      sprite[19 + rowOffset][2] = colors.sleeve;
      sprite[19 + rowOffset][3] = colors.sleeve;
      sprite[19 + rowOffset][12] = colors.sleeve;
      sprite[19 + rowOffset][13] = colors.sleeve;

      if (sprite[15 + rowOffset]) {
        sprite[15 + rowOffset][7] = isFull ? liquid : mug;
        sprite[15 + rowOffset][8] = mug;
      }
      if (isFull) {
        if (sprite[14 + rowOffset]) sprite[14 + rowOffset][7] = BREAK_COFFEE_STEAM_COLOR_1;
        if (sprite[13 + rowOffset]) sprite[13 + rowOffset][8] = BREAK_COFFEE_STEAM_COLOR_2;
      }
    }
  }

  return sprite;
}

/** Render a snack/donut with animated arms, sleeves, and nibbling cycle */
function renderSnackBreakSprite(
  base: SpriteData,
  frame: number,
  dir: Direction,
  isSitting = false,
  colors: CharacterColors = {
    skin: BREAK_HAND_COLOR,
    shadow: BREAK_HAND_SHADOW_COLOR,
    sleeve: BREAK_HAND_COLOR,
    torso: BREAK_HAND_COLOR,
    pants: BREAK_HAND_COLOR,
  },
): SpriteData {
  if (dir === Direction.LEFT) {
    const flippedBase = flipSpriteHorizontal(base);
    const renderedRight = renderSnackBreakSprite(
      flippedBase,
      frame,
      Direction.RIGHT,
      isSitting,
      colors,
    );
    return flipSpriteHorizontal(renderedRight);
  }

  const sprite = cloneSprite(base);
  const rows = sprite.length;
  const cols = sprite[0]?.length ?? 0;
  if (rows < 24 || cols < 16) return sprite;

  const rowOffset = isSitting ? 1 : 0;
  const animPhase = frame % 4;

  if (dir === Direction.DOWN) {
    // Clear hanging arms
    for (let r = 21 + rowOffset; r <= 24 + rowOffset; r++) {
      if (sprite[r]) {
        sprite[r][1] = '';
        sprite[r][2] = '';
        sprite[r][3] = '';
        sprite[r][12] = '';
        sprite[r][13] = '';
        sprite[r][14] = '';
      }
    }
    if (sprite[23 + rowOffset]) {
      sprite[23 + rowOffset][3] = colors.torso;
      sprite[23 + rowOffset][12] = colors.torso;
    }

    if (animPhase === 0 || animPhase === 3) {
      // Holding snack comfortably at chest
      const snackRow = 18 + rowOffset;
      if (sprite[snackRow] && sprite[snackRow + 1]) {
        sprite[snackRow][7] = BREAK_SNACK_FROSTING_COLOR;
        sprite[snackRow][8] = BREAK_SNACK_SPRINKLE_COLOR;
        sprite[snackRow + 1][7] = BREAK_SNACK_BASE_COLOR;
        sprite[snackRow + 1][8] = BREAK_SNACK_BASE_COLOR;

        // Arms cupping snack
        sprite[20 + rowOffset][3] = colors.sleeve;
        sprite[21 + rowOffset][4] = colors.sleeve;
        sprite[20 + rowOffset][5] = colors.sleeve;
        sprite[19 + rowOffset][6] = colors.skin;

        sprite[20 + rowOffset][12] = colors.sleeve;
        sprite[21 + rowOffset][11] = colors.sleeve;
        sprite[20 + rowOffset][10] = colors.sleeve;
        sprite[19 + rowOffset][9] = colors.skin;
      }
    } else if (animPhase === 1) {
      // Raising snack toward mouth
      const snackRow = 17 + rowOffset;
      if (sprite[snackRow] && sprite[snackRow + 1]) {
        sprite[snackRow][7] = BREAK_SNACK_FROSTING_COLOR;
        sprite[snackRow][8] = BREAK_SNACK_FROSTING_COLOR;
        sprite[snackRow + 1][7] = BREAK_SNACK_BASE_COLOR;
        sprite[snackRow + 1][8] = BREAK_SNACK_BASE_COLOR;

        sprite[21 + rowOffset][3] = colors.sleeve;
        sprite[20 + rowOffset][4] = colors.sleeve;
        sprite[19 + rowOffset][5] = colors.sleeve;
        sprite[18 + rowOffset][6] = colors.skin;

        sprite[21 + rowOffset][12] = colors.sleeve;
        sprite[20 + rowOffset][11] = colors.sleeve;
        sprite[19 + rowOffset][10] = colors.sleeve;
        sprite[18 + rowOffset][9] = colors.skin;
      }
    } else {
      // Phase 2: Nibbling! Snack right at mouth, crumbs falling
      const snackRow = 16 + rowOffset;
      if (sprite[snackRow] && sprite[snackRow + 1]) {
        sprite[snackRow][7] = BREAK_SNACK_FROSTING_COLOR;
        sprite[snackRow][8] = BREAK_SNACK_SPRINKLE_COLOR;
        sprite[snackRow + 1][7] = BREAK_SNACK_BASE_COLOR;
        sprite[snackRow + 1][8] = BREAK_SNACK_BASE_COLOR;

        sprite[21 + rowOffset][3] = colors.sleeve;
        sprite[20 + rowOffset][3] = colors.sleeve;
        sprite[19 + rowOffset][4] = colors.sleeve;
        sprite[18 + rowOffset][5] = colors.sleeve;
        sprite[16 + rowOffset][6] = colors.skin;
        sprite[17 + rowOffset][6] = colors.skin;

        sprite[21 + rowOffset][12] = colors.sleeve;
        sprite[20 + rowOffset][12] = colors.sleeve;
        sprite[19 + rowOffset][11] = colors.sleeve;
        sprite[18 + rowOffset][10] = colors.sleeve;
        sprite[16 + rowOffset][9] = colors.skin;
        sprite[17 + rowOffset][9] = colors.skin;

        // Falling crumbs
        if (sprite[snackRow + 2]) sprite[snackRow + 2][6] = BREAK_SNACK_CRUMB_COLOR;
        if (sprite[snackRow + 3]) sprite[snackRow + 3][8] = BREAK_SNACK_CRUMB_COLOR;
      }
    }
  } else if (dir === Direction.RIGHT) {
    // Clear front hanging arm
    for (let r = 21 + rowOffset; r <= 24 + rowOffset; r++) {
      if (sprite[r]) {
        sprite[r][6] = colors.torso;
        sprite[r][7] = colors.torso;
        sprite[r][8] = '';
      }
    }

    if (animPhase === 0 || animPhase === 3) {
      const snackRow = 18 + rowOffset;
      if (sprite[snackRow] && sprite[snackRow + 1]) {
        sprite[snackRow][10] = BREAK_SNACK_FROSTING_COLOR;
        sprite[snackRow][11] = BREAK_SNACK_SPRINKLE_COLOR;
        sprite[snackRow + 1][10] = BREAK_SNACK_BASE_COLOR;
        sprite[snackRow + 1][11] = BREAK_SNACK_BASE_COLOR;

        sprite[20 + rowOffset][6] = colors.sleeve;
        sprite[21 + rowOffset][7] = colors.sleeve;
        sprite[20 + rowOffset][8] = colors.sleeve;
        sprite[19 + rowOffset][9] = colors.skin;
      }
    } else if (animPhase === 1) {
      const snackRow = 17 + rowOffset;
      if (sprite[snackRow] && sprite[snackRow + 1]) {
        sprite[snackRow][10] = BREAK_SNACK_FROSTING_COLOR;
        sprite[snackRow][11] = BREAK_SNACK_FROSTING_COLOR;
        sprite[snackRow + 1][10] = BREAK_SNACK_BASE_COLOR;
        sprite[snackRow + 1][11] = BREAK_SNACK_BASE_COLOR;

        sprite[20 + rowOffset][6] = colors.sleeve;
        sprite[19 + rowOffset][7] = colors.sleeve;
        sprite[18 + rowOffset][8] = colors.sleeve;
        sprite[17 + rowOffset][9] = colors.skin;
      }
    } else {
      const snackRow = 15 + rowOffset;
      if (sprite[snackRow] && sprite[snackRow + 1]) {
        sprite[snackRow][10] = BREAK_SNACK_FROSTING_COLOR;
        sprite[snackRow][11] = BREAK_SNACK_SPRINKLE_COLOR;
        sprite[snackRow + 1][10] = BREAK_SNACK_BASE_COLOR;
        sprite[snackRow + 1][11] = BREAK_SNACK_BASE_COLOR;

        sprite[20 + rowOffset][6] = colors.sleeve;
        sprite[19 + rowOffset][7] = colors.sleeve;
        sprite[18 + rowOffset][8] = colors.sleeve;
        sprite[15 + rowOffset][9] = colors.skin;
        sprite[16 + rowOffset][9] = colors.skin;

        if (sprite[snackRow + 2]) sprite[snackRow + 2][9] = BREAK_SNACK_CRUMB_COLOR;
      }
    }
  } else if (dir === Direction.UP) {
    for (let r = 21 + rowOffset; r <= 24 + rowOffset; r++) {
      if (sprite[r]) {
        sprite[r][1] = '';
        sprite[r][2] = '';
        sprite[r][13] = '';
        sprite[r][14] = '';
      }
    }
    sprite[20 + rowOffset][2] = colors.sleeve;
    sprite[21 + rowOffset][3] = colors.sleeve;
    sprite[20 + rowOffset][13] = colors.sleeve;
    sprite[21 + rowOffset][12] = colors.sleeve;
  }

  return sprite;
}

/** Render handheld Steam Deck console with animated sleeves and hands gripping sides */
function renderSteamDeckBreakSprite(
  base: SpriteData,
  frame: number,
  dir: Direction = Direction.DOWN,
  isSitting = false,
  colors: CharacterColors = {
    skin: BREAK_HAND_COLOR,
    shadow: BREAK_HAND_SHADOW_COLOR,
    sleeve: BREAK_HAND_COLOR,
    torso: BREAK_HAND_COLOR,
    pants: BREAK_HAND_COLOR,
  },
): SpriteData {
  const sprite = cloneSprite(base);
  const rows = sprite.length;
  const cols = sprite[0]?.length ?? 0;
  if (rows < 24 || cols < 16) return sprite;

  const rowOffset = isSitting ? 1 : 0;
  const deckRow = 19 + rowOffset;
  const deckStartCol = 3;

  // Clear hanging outer arms
  for (let r = 21 + rowOffset; r <= 24 + rowOffset; r++) {
    if (sprite[r]) {
      sprite[r][1] = '';
      sprite[r][2] = '';
      sprite[r][13] = '';
      sprite[r][14] = '';
    }
  }

  if (dir === Direction.UP) {
    // Rear matte backplate and hands on grips
    for (let r = 0; r < 2; r++) {
      const curRow = deckRow + r;
      if (!sprite[curRow]) continue;
      for (let c = deckStartCol; c <= deckStartCol + 9; c++) {
        sprite[curRow][c] = BREAK_STEAMDECK_BODY_COLOR;
      }
    }
    if (sprite[deckRow]) {
      sprite[deckRow][deckStartCol + 1] = BREAK_STEAMDECK_BUTTON_COLOR;
      sprite[deckRow][deckStartCol + 2] = BREAK_STEAMDECK_BUTTON_COLOR;
      sprite[deckRow][deckStartCol + 7] = BREAK_STEAMDECK_BUTTON_COLOR;
      sprite[deckRow][deckStartCol + 8] = BREAK_STEAMDECK_BUTTON_COLOR;
    }
    const leftGripCol = deckStartCol - 1;
    const rightGripCol = deckStartCol + 10;
    if (sprite[deckRow] && sprite[deckRow + 1]) {
      sprite[deckRow][leftGripCol] = colors.skin;
      sprite[deckRow + 1][leftGripCol] = colors.shadow;
      sprite[deckRow][rightGripCol] = colors.skin;
      sprite[deckRow + 1][rightGripCol] = colors.shadow;
    }
    sprite[20 + rowOffset][2] = colors.sleeve;
    sprite[20 + rowOffset][13] = colors.sleeve;
    return sprite;
  }

  // Draw console body
  for (let r = 0; r < 3; r++) {
    const curRow = deckRow + r;
    if (!sprite[curRow]) continue;
    for (let c = deckStartCol; c <= deckStartCol + 9; c++) {
      sprite[curRow][c] = BREAK_STEAMDECK_BODY_COLOR;
    }
  }

  // Screen and controls
  if (sprite[deckRow] && sprite[deckRow + 1]) {
    sprite[deckRow][deckStartCol + 1] = BREAK_STEAMDECK_BUTTON_COLOR;
    sprite[deckRow + 1][deckStartCol + 1] = BREAK_STEAMDECK_BUTTON_COLOR;
    sprite[deckRow][deckStartCol + 8] = BREAK_STEAMDECK_BUTTON_COLOR;
    sprite[deckRow + 1][deckStartCol + 8] = BREAK_STEAMDECK_BUTTON_COLOR;

    const screenColStart = deckStartCol + 3;
    for (let sc = screenColStart; sc <= screenColStart + 3; sc++) {
      sprite[deckRow][sc] = BREAK_STEAMDECK_SCREEN_ON_1;
      sprite[deckRow + 1][sc] = BREAK_STEAMDECK_SCREEN_ON_2;
    }
  }

  // Active game gameplay animations on the Steam Deck screen
  const gameFrame = frame % 4;
  if (gameFrame === 0) {
    sprite[deckRow][deckStartCol + 3] = BREAK_STEAMDECK_HERO_COLOR;
    sprite[deckRow + 1][deckStartCol + 6] = BREAK_STEAMDECK_COIN_COLOR;
  } else if (gameFrame === 1) {
    sprite[deckRow][deckStartCol + 4] = BREAK_STEAMDECK_HERO_COLOR;
    sprite[deckRow + 1][deckStartCol + 6] = BREAK_STEAMDECK_ENEMY_COLOR;
  } else if (gameFrame === 2) {
    sprite[deckRow + 1][deckStartCol + 5] = BREAK_STEAMDECK_HERO_COLOR;
    sprite[deckRow + 1][deckStartCol + 6] = BREAK_STEAMDECK_SLASH_COLOR;
  } else {
    sprite[deckRow][deckStartCol + 5] = BREAK_STEAMDECK_VICTORY_COLOR;
    sprite[deckRow + 1][deckStartCol + 5] = BREAK_STEAMDECK_HERO_COLOR;
  }

  // Connect sleeves from shoulders down to grips!
  sprite[20 + rowOffset][3] = colors.sleeve;
  sprite[20 + rowOffset][12] = colors.sleeve;

  // Hands gripping left and right grips + animated thumbs clicking buttons!
  const leftGripCol = deckStartCol - 1; // col 2
  const rightGripCol = deckStartCol + 10; // col 13

  if (sprite[deckRow] && sprite[deckRow + 1] && sprite[deckRow + 2]) {
    sprite[deckRow][leftGripCol] = colors.skin;
    sprite[deckRow + 1][leftGripCol] = colors.skin;
    sprite[deckRow + 2][leftGripCol] = colors.shadow;
    sprite[deckRow + 2][leftGripCol + 1] = colors.shadow;

    sprite[deckRow][rightGripCol] = colors.skin;
    sprite[deckRow + 1][rightGripCol] = colors.skin;
    sprite[deckRow + 2][rightGripCol] = colors.shadow;
    sprite[deckRow + 2][rightGripCol - 1] = colors.shadow;

    if (frame % 2 === 0) {
      sprite[deckRow][deckStartCol + 1] = colors.skin;
      sprite[deckRow][deckStartCol + 8] = colors.skin;
    } else {
      sprite[deckRow + 1][deckStartCol + 1] = colors.skin;
      sprite[deckRow + 1][deckStartCol + 8] = colors.skin;
    }
  }

  return sprite;
}

/** Render operating arms when agent interacts with kitchen appliances (espresso, fridge, sink) */
function renderKitchenActionSprite(
  base: SpriteData,
  action: 'espresso' | 'fridge' | 'sink',
  frame: number,
  colors: CharacterColors,
): SpriteData {
  const sprite = cloneSprite(base);
  const rows = sprite.length;
  const cols = sprite[0]?.length ?? 0;
  if (rows < 24 || cols < 16) return sprite;

  // Clear static hanging lower arms
  for (let r = 21; r <= 24; r++) {
    if (sprite[r]) {
      sprite[r][1] = '';
      sprite[r][2] = '';
      sprite[r][13] = '';
      sprite[r][14] = '';
    }
  }

  if (action === 'espresso') {
    // Arms reach up and forward to espresso machine buttons and portafilter
    sprite[20][3] = colors.sleeve;
    sprite[19][3] = colors.sleeve;
    sprite[18][4] = colors.sleeve;
    sprite[17][5] = colors.skin;

    sprite[20][12] = colors.sleeve;
    sprite[19][12] = colors.sleeve;
    sprite[18][11] = colors.sleeve;
    sprite[17][10] = colors.skin;

    if (frame % 2 === 0) {
      sprite[16][5] = colors.skin; // pressing button
    } else {
      sprite[16][10] = colors.skin; // adjusting group head
    }
  } else if (action === 'fridge') {
    // Right arm reaches into fridge, left arm on door
    sprite[20][3] = colors.sleeve;
    sprite[19][3] = colors.sleeve;
    sprite[18][2] = colors.skin; // holding door

    sprite[20][12] = colors.sleeve;
    sprite[19][11] = colors.sleeve;
    sprite[18][10] = colors.sleeve;
    sprite[17][9] = colors.skin;
    if (frame % 2 === 0) {
      sprite[16][9] = colors.skin; // reaching in
    }
  } else if (action === 'sink') {
    // Both arms reaching down into the basin, washing the mug
    sprite[20][3] = colors.sleeve;
    sprite[21][4] = colors.sleeve;
    sprite[21][5] = colors.sleeve;
    sprite[20][6] = colors.skin;

    sprite[20][12] = colors.sleeve;
    sprite[21][11] = colors.sleeve;
    sprite[21][10] = colors.sleeve;
    sprite[20][9] = colors.skin;

    // Ceramic mug in basin under tap
    sprite[19][7] = BREAK_COFFEE_MUG_COLOR;
    sprite[19][8] = BREAK_COFFEE_MUG_COLOR;
    sprite[18][7] = KITCHEN_SINK_WATER_SPLASH; // water splash
    if (frame % 2 === 1) {
      sprite[18][8] = KITCHEN_SINK_WATER_FOAM;
    }
  }

  return sprite;
}

/** Get the correct sprite frame for a character's current state and direction */
export function getCharacterSprite(ch: Character, sprites: CharacterSprites): SpriteData {
  const downStand = sprites.walk[Direction.DOWN][1];
  const colors = extractCharacterColors(downStand);

  const baseWalk = sprites.walk[ch.dir][1];
  const baseSit = sprites.reading[ch.dir][0];
  const baseSprite = ch.isSitting ? baseSit : baseWalk;

  // 1. Kitchen interactive actions (espresso brewing, fridge grabbing, sink washing)
  if (ch.kitchenAction && ch.dir === Direction.UP) {
    return renderKitchenActionSprite(baseSprite, ch.kitchenAction, ch.frame, colors);
  }

  let sprite: SpriteData;

  switch (ch.state) {
    case CharacterState.TYPE:
      if (isReadingTool(ch.currentTool)) {
        sprite = sprites.reading[ch.dir][ch.frame % 2];
      } else {
        sprite = sprites.typing[ch.dir][ch.frame % 2];
      }
      break;
    case CharacterState.WALK:
      sprite = sprites.walk[ch.dir][ch.frame % 4];
      break;
    case CharacterState.IDLE:
      sprite = baseSprite;
      break;
    case CharacterState.BREAK_COFFEE:
      return renderCoffeeBreakSprite(
        baseSprite,
        ch.frame,
        ch.dir,
        ch.breakType === 'tea',
        ch.isSitting,
        ch.coffeeCupState !== 'empty',
        colors,
      );
    case CharacterState.BREAK_SNACK:
      return renderSnackBreakSprite(baseSprite, ch.frame, ch.dir, ch.isSitting, colors);
    case CharacterState.BREAK_STEAMDECK:
      return renderSteamDeckBreakSprite(baseSprite, ch.frame, ch.dir, ch.isSitting, colors);
    default:
      sprite = baseSprite;
      break;
  }

  // If character is carrying a cup of coffee while walking or idle, render it in their hands!
  if (ch.hasCoffeeCup && ch.state !== CharacterState.TYPE) {
    // When walking, keep cup stably held in hands (Phase 0) while legs walk
    const carryFrame = ch.state === CharacterState.WALK ? 0 : ch.frame;
    return renderCoffeeBreakSprite(
      sprite,
      carryFrame,
      ch.dir,
      false,
      ch.isSitting,
      ch.coffeeCupState !== 'empty',
      colors,
    );
  }

  return sprite;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
