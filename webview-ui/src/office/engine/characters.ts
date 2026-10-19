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
      const seat = ch.seatId ? seats.get(ch.seatId) : null;
      if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
        ch.isSitting = true;
        ch.dir = seat.facingDir;
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
      const seat = ch.seatId ? seats.get(ch.seatId) : null;
      if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
        ch.isSitting = true;
        ch.dir = seat.facingDir;
      }
      // No idle animation — static pose
      ch.frame = 0;
      if (ch.seatTimer < 0) ch.seatTimer = 0; // clear turn-end sentinel
      // If became active, pathfind to seat
      if (ch.isActive) {
        if (!ch.seatId) {
          // No seat assigned — type in place
          ch.state = CharacterState.TYPE;
          ch.frame = 0;
          ch.frameTimer = 0;
          break;
        }
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
            ch.frame = 0;
            ch.frameTimer = 0;
          }
        }
        break;
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
          if (ch.breakType === 'coffee') ch.state = CharacterState.BREAK_COFFEE;
          else if (ch.breakType === 'snack') ch.state = CharacterState.BREAK_SNACK;
          else if (ch.breakType === 'steamdeck') ch.state = CharacterState.BREAK_STEAMDECK;
          else ch.state = CharacterState.BREAK_COFFEE;
          ch.frame = 0;
          ch.frameTimer = 0;
          break;
        }

        if (ch.isActive) {
          if (!ch.seatId) {
            // No seat — type in place
            ch.state = CharacterState.TYPE;
          } else {
            const seat = seats.get(ch.seatId);
            if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              ch.state = CharacterState.TYPE;
              ch.dir = seat.facingDir;
              ch.isSitting = true;
            } else {
              ch.state = CharacterState.IDLE;
            }
          }
        } else {
          // Check if arrived at assigned seat — sit down for a rest before wandering again
          if (ch.seatId) {
            const seat = seats.get(ch.seatId);
            if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
              ch.state = CharacterState.TYPE;
              ch.dir = seat.facingDir;
              ch.isSitting = true;
              // seatTimer < 0 is a sentinel from setAgentActive(false) meaning
              // "turn just ended" — skip the long rest so idle transition is immediate
              if (ch.seatTimer < 0) {
                ch.seatTimer = 0;
              } else {
                ch.seatTimer = randomRange(SEAT_REST_MIN_SEC, SEAT_REST_MAX_SEC);
              }
              ch.wanderCount = 0;
              ch.wanderLimit = randomInt(
                WANDER_MOVES_BEFORE_REST_MIN,
                WANDER_MOVES_BEFORE_REST_MAX,
              );
              ch.frame = 0;
              ch.frameTimer = 0;
              break;
            }
          }
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
          } else {
            if (ch.breakType === 'coffee' || ch.breakType === 'tea')
              ch.state = CharacterState.BREAK_COFFEE;
            else if (ch.breakType === 'snack') ch.state = CharacterState.BREAK_SNACK;
            else if (ch.breakType === 'steamdeck') ch.state = CharacterState.BREAK_STEAMDECK;
            else ch.state = CharacterState.BREAK_COFFEE;
          }
        }
      }

      // If became active while wandering, repath to seat
      if (ch.isActive && ch.seatId) {
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

/** Helper to extract character skin tones from face pixels for natural hands */
function getSkinTones(base: SpriteData): { skin: string; shadow: string } {
  for (let r = 11; r <= 13; r++) {
    const row = base[r];
    if (row && row[7] && row[7] !== '') {
      const skin = row[7];
      const shadow =
        base[r + 1] && base[r + 1][7] && base[r + 1][7] !== ''
          ? base[r + 1][7]
          : BREAK_HAND_SHADOW_COLOR;
      return { skin, shadow };
    }
  }
  return { skin: BREAK_HAND_COLOR, shadow: BREAK_HAND_SHADOW_COLOR };
}

/** Render a steaming coffee/tea mug in character's hands with animated sipping */
function renderCoffeeBreakSprite(
  base: SpriteData,
  frame: number,
  dir: Direction,
  isTea = false,
  isSitting = false,
): SpriteData {
  const sprite = cloneSprite(base);
  const rows = sprite.length;
  const cols = sprite[0]?.length ?? 0;
  if (rows < 24 || cols < 16) return sprite;

  const { skin, shadow: handShadow } = getSkinTones(base);
  const isRight = dir === Direction.RIGHT;
  const isLeft = dir === Direction.LEFT;
  const isSip = frame % 4 === 2;

  const baseRow = isSitting ? 19 : 18;
  const mugRow = isSip ? baseRow - 2 : baseRow;
  const mugCol = isRight ? 9 : isLeft ? 5 : 7;

  if (sprite[mugRow] && sprite[mugRow + 1] && sprite[mugRow + 2]) {
    const liquid = isTea ? BREAK_TEA_LIQUID_COLOR : BREAK_COFFEE_LIQUID_COLOR;
    const mug = isTea ? BREAK_TEA_CUP_COLOR : BREAK_COFFEE_MUG_COLOR;
    const shadow = isTea ? BREAK_TEA_SHADOW_COLOR : BREAK_COFFEE_MUG_SHADOW;

    // Draw Mug
    sprite[mugRow][mugCol] = liquid;
    sprite[mugRow][mugCol + 1] = liquid;
    sprite[mugRow + 1][mugCol] = mug;
    sprite[mugRow + 1][mugCol + 1] = mug;
    if (mugCol + 2 < cols) {
      sprite[mugRow + 1][mugCol + 2] = isTea ? BREAK_TEA_TAG_COLOR : mug;
    }
    sprite[mugRow + 2][mugCol] = shadow;
    sprite[mugRow + 2][mugCol + 1] = shadow;

    // Animated hands holding / sipping
    if (dir === Direction.DOWN) {
      if (isSip) {
        // Hands lifted up near mouth holding the warm cup
        if (sprite[mugRow]) {
          sprite[mugRow][mugCol - 1] = skin;
          sprite[mugRow][mugCol + 2] = skin;
        }
        if (sprite[mugRow + 1]) {
          sprite[mugRow + 1][mugCol - 1] = handShadow;
          sprite[mugRow + 1][mugCol + 2] = handShadow;
        }
      } else {
        // Hands cupping both sides of the mug
        if (sprite[mugRow + 1]) {
          sprite[mugRow + 1][mugCol - 1] = skin;
          sprite[mugRow + 1][mugCol + 2] = skin;
        }
        if (sprite[mugRow + 2]) {
          sprite[mugRow + 2][mugCol - 1] = handShadow;
          sprite[mugRow + 2][mugCol + 2] = handShadow;
        }
      }
    } else if (isRight) {
      // Right-facing: hands holding mug out in front
      if (sprite[mugRow + 1]) {
        sprite[mugRow + 1][mugCol - 1] = skin;
        sprite[mugRow + 1][mugCol] = skin;
      }
      if (sprite[mugRow + 2]) {
        sprite[mugRow + 2][mugCol - 1] = handShadow;
      }
    } else if (isLeft) {
      // Left-facing: hands holding mug out in front
      if (sprite[mugRow + 1]) {
        sprite[mugRow + 1][mugCol + 1] = skin;
        sprite[mugRow + 1][mugCol + 2] = skin;
      }
      if (sprite[mugRow + 2]) {
        sprite[mugRow + 2][mugCol + 2] = handShadow;
      }
    }

    // 4-frame dynamic rising steam wisps
    const steamPhase = frame % 4;
    if (steamPhase === 0) {
      if (sprite[mugRow - 1]) sprite[mugRow - 1][mugCol] = BREAK_COFFEE_STEAM_COLOR_1;
    } else if (steamPhase === 1) {
      if (sprite[mugRow - 1]) sprite[mugRow - 1][mugCol + 1] = BREAK_COFFEE_STEAM_COLOR_1;
      if (sprite[mugRow - 2]) sprite[mugRow - 2][mugCol] = BREAK_COFFEE_STEAM_COLOR_2;
    } else if (steamPhase === 2) {
      if (sprite[mugRow - 1]) sprite[mugRow - 1][mugCol] = BREAK_COFFEE_STEAM_COLOR_2;
      if (sprite[mugRow - 2]) sprite[mugRow - 2][mugCol + 1] = BREAK_COFFEE_STEAM_COLOR_1;
      if (sprite[mugRow - 3]) sprite[mugRow - 3][mugCol] = BREAK_COFFEE_STEAM_COLOR_2;
    } else {
      if (sprite[mugRow - 2]) sprite[mugRow - 2][mugCol] = BREAK_COFFEE_STEAM_COLOR_2;
      if (sprite[mugRow - 3]) sprite[mugRow - 3][mugCol + 1] = BREAK_COFFEE_STEAM_COLOR_1;
    }
  }

  return sprite;
}

/** Render a snack/donut with animated hands holding and bringing it to mouth */
function renderSnackBreakSprite(
  base: SpriteData,
  frame: number,
  dir: Direction,
  isSitting = false,
): SpriteData {
  const sprite = cloneSprite(base);
  const rows = sprite.length;
  const cols = sprite[0]?.length ?? 0;
  if (rows < 24 || cols < 16) return sprite;

  const { skin, shadow: handShadow } = getSkinTones(base);
  const isRight = dir === Direction.RIGHT;
  const isLeft = dir === Direction.LEFT;
  const snackCol = isRight ? 9 : isLeft ? 5 : 7;
  const animPhase = frame % 4;
  const isNibble = animPhase === 1 || animPhase === 2;

  const baseRow = isSitting ? 19 : 18;
  const snackRow = isNibble ? baseRow - 2 : baseRow;

  if (sprite[snackRow] && sprite[snackRow + 1]) {
    // Frosting with rainbow sprinkle details
    sprite[snackRow][snackCol] = BREAK_SNACK_FROSTING_COLOR;
    sprite[snackRow][snackCol + 1] =
      animPhase === 0 ? BREAK_SNACK_SPRINKLE_COLOR : BREAK_SNACK_FROSTING_COLOR;
    sprite[snackRow + 1][snackCol] = BREAK_SNACK_BASE_COLOR;
    sprite[snackRow + 1][snackCol + 1] = BREAK_SNACK_BASE_COLOR;

    // Hands holding the snack!
    if (isNibble) {
      // Hand holding snack right up to mouth
      if (sprite[snackRow + 1]) {
        sprite[snackRow + 1][snackCol - 1] = skin;
      }
      if (sprite[snackRow + 2]) {
        sprite[snackRow + 2][snackCol] = skin;
        sprite[snackRow + 2][snackCol + 1] = handShadow;
      }
      // Drifting crumbs
      if (sprite[snackRow + 2]) {
        sprite[snackRow + 2][snackCol - 1] = BREAK_SNACK_CRUMB_COLOR;
      }
      if (animPhase === 2 && sprite[snackRow + 3]) {
        sprite[snackRow + 3][snackCol - 1] = BREAK_SNACK_CRUMB_COLOR;
      }
    } else {
      // Hands holding snack comfortably
      if (sprite[snackRow + 1]) {
        sprite[snackRow + 1][snackCol - 1] = skin;
        sprite[snackRow + 1][snackCol + 2] = skin;
      }
      if (sprite[snackRow + 2]) {
        sprite[snackRow + 2][snackCol] = handShadow;
        sprite[snackRow + 2][snackCol + 1] = handShadow;
      }
    }
  }

  return sprite;
}

/** Render handheld Steam Deck console with animated hands gripping sides and clicking buttons */
function renderSteamDeckBreakSprite(
  base: SpriteData,
  frame: number,
  isSitting = false,
): SpriteData {
  const sprite = cloneSprite(base);
  const rows = sprite.length;
  const cols = sprite[0]?.length ?? 0;
  if (rows < 24 || cols < 16) return sprite;

  const { skin, shadow: handShadow } = getSkinTones(base);
  const deckRow = isSitting ? 20 : 19;
  const deckStartCol = 3;

  for (let r = 0; r < 3; r++) {
    const curRow = deckRow + r;
    if (!sprite[curRow]) continue;
    for (let c = deckStartCol; c <= deckStartCol + 9; c++) {
      sprite[curRow][c] = BREAK_STEAMDECK_BODY_COLOR;
    }
  }

  if (sprite[deckRow] && sprite[deckRow + 1]) {
    sprite[deckRow][deckStartCol + 1] = BREAK_STEAMDECK_BUTTON_COLOR;
    sprite[deckRow + 1][deckStartCol] = BREAK_STEAMDECK_BUTTON_COLOR;
    sprite[deckRow][deckStartCol + 8] = BREAK_STEAMDECK_BUTTON_COLOR;
    sprite[deckRow + 1][deckStartCol + 9] = BREAK_STEAMDECK_BUTTON_COLOR;
  }

  // 4-frame dynamic 8-bit game scene on the Steam Deck screen
  const gameFrame = frame % 4;
  const screenRows = [deckRow, deckRow + 1];
  for (const r of screenRows) {
    if (!sprite[r]) continue;
    for (let c = deckStartCol + 2; c <= deckStartCol + 7; c++) {
      sprite[r][c] = BREAK_STEAMDECK_SCREEN_ON_1;
    }
  }

  if (gameFrame === 0) {
    sprite[deckRow][deckStartCol + 2] = BREAK_STEAMDECK_SCREEN_ON_2;
    sprite[deckRow + 1][deckStartCol + 2] = BREAK_STEAMDECK_HERO_COLOR;
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

  // Hands gripping left and right grips + animated thumbs clicking buttons!
  const leftGripCol = deckStartCol - 1; // col 2
  const rightGripCol = deckStartCol + 10; // col 13

  if (sprite[deckRow] && sprite[deckRow + 1] && sprite[deckRow + 2]) {
    // Left hand gripping
    sprite[deckRow][leftGripCol] = skin;
    sprite[deckRow + 1][leftGripCol] = skin;
    sprite[deckRow + 2][leftGripCol] = handShadow;
    sprite[deckRow + 2][leftGripCol + 1] = handShadow;

    // Right hand gripping
    sprite[deckRow][rightGripCol] = skin;
    sprite[deckRow + 1][rightGripCol] = skin;
    sprite[deckRow + 2][rightGripCol] = handShadow;
    sprite[deckRow + 2][rightGripCol - 1] = handShadow;

    // Animated active thumbs clicking buttons!
    if (frame % 2 === 0) {
      sprite[deckRow][deckStartCol + 1] = skin;
      sprite[deckRow][deckStartCol + 8] = skin;
    } else {
      sprite[deckRow + 1][deckStartCol + 1] = skin;
      sprite[deckRow + 1][deckStartCol + 8] = skin;
    }
  }

  return sprite;
}

/** Get the correct sprite frame for a character's current state and direction */
export function getCharacterSprite(ch: Character, sprites: CharacterSprites): SpriteData {
  const baseWalk = sprites.walk[ch.dir][1];
  const baseSit = sprites.reading[ch.dir][0];
  const baseSprite = ch.isSitting ? baseSit : baseWalk;

  switch (ch.state) {
    case CharacterState.TYPE:
      if (isReadingTool(ch.currentTool)) {
        return sprites.reading[ch.dir][ch.frame % 2];
      }
      return sprites.typing[ch.dir][ch.frame % 2];
    case CharacterState.WALK:
      return sprites.walk[ch.dir][ch.frame % 4];
    case CharacterState.IDLE:
      return baseSprite;
    case CharacterState.BREAK_COFFEE:
      return renderCoffeeBreakSprite(
        baseSprite,
        ch.frame,
        ch.dir,
        ch.breakType === 'tea',
        ch.isSitting,
      );
    case CharacterState.BREAK_SNACK:
      return renderSnackBreakSprite(baseSprite, ch.frame, ch.dir, ch.isSitting);
    case CharacterState.BREAK_STEAMDECK:
      return renderSteamDeckBreakSprite(baseSprite, ch.frame, ch.isSitting);
    default:
      return baseSprite;
  }
}
function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
