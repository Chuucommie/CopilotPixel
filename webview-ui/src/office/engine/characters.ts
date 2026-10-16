import {
  BREAK_COFFEE_LIQUID_COLOR,
  BREAK_COFFEE_MUG_COLOR,
  BREAK_COFFEE_MUG_SHADOW,
  BREAK_COFFEE_STEAM_COLOR_1,
  BREAK_COFFEE_STEAM_COLOR_2,
  BREAK_SNACK_BASE_COLOR,
  BREAK_SNACK_CRUMB_COLOR,
  BREAK_SNACK_FROSTING_COLOR,
  BREAK_STEAMDECK_BODY_COLOR,
  BREAK_STEAMDECK_BUTTON_COLOR,
  BREAK_STEAMDECK_GLOW_COLOR,
  BREAK_STEAMDECK_SCREEN_ON_1,
  BREAK_STEAMDECK_SCREEN_ON_2,
  BREAK_STEAMDECK_SCREEN_ON_3,
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
  const col = seat ? seat.seatCol : 1;
  const row = seat ? seat.seatRow : 1;
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
      if (ch.frameTimer >= TYPE_FRAME_DURATION_SEC) {
        ch.frameTimer -= TYPE_FRAME_DURATION_SEC;
        ch.frame = (ch.frame + 1) % 2;
      }
      // If no longer active, stand up and start wandering (after seatTimer expires)
      if (!ch.isActive) {
        if (ch.seatTimer > 0) {
          ch.seatTimer -= dt;
          break;
        }
        ch.seatTimer = 0; // clear sentinel
        ch.state = CharacterState.IDLE;
        ch.frame = 0;
        ch.frameTimer = 0;
        ch.wanderTimer = randomRange(WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
        ch.wanderCount = 0;
        ch.wanderLimit = randomInt(WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX);
      }
      break;
    }

    case CharacterState.IDLE: {
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

/** Render a steaming coffee mug in front of the character */
function renderCoffeeBreakSprite(base: SpriteData, frame: number, dir: Direction): SpriteData {
  const sprite = cloneSprite(base);
  const rows = sprite.length;
  const cols = sprite[0]?.length ?? 0;
  if (rows < 24 || cols < 16) return sprite;

  const isRight = dir === Direction.RIGHT;
  const isLeft = dir === Direction.LEFT;
  const mugCol = isRight ? 9 : isLeft ? 5 : 7;
  const mugRow = 19;

  if (sprite[mugRow] && sprite[mugRow + 1] && sprite[mugRow + 2]) {
    sprite[mugRow][mugCol] = BREAK_COFFEE_LIQUID_COLOR;
    sprite[mugRow][mugCol + 1] = BREAK_COFFEE_LIQUID_COLOR;
    sprite[mugRow + 1][mugCol] = BREAK_COFFEE_MUG_COLOR;
    sprite[mugRow + 1][mugCol + 1] = BREAK_COFFEE_MUG_COLOR;
    if (mugCol + 2 < cols) {
      sprite[mugRow + 1][mugCol + 2] = BREAK_COFFEE_MUG_COLOR;
    }
    sprite[mugRow + 2][mugCol] = BREAK_COFFEE_MUG_SHADOW;
    sprite[mugRow + 2][mugCol + 1] = BREAK_COFFEE_MUG_SHADOW;

    const steamCycle = frame % 2;
    const steamCol1 = steamCycle === 0 ? mugCol : mugCol + 1;
    const steamCol2 = steamCycle === 0 ? mugCol + 1 : mugCol;
    if (sprite[mugRow - 1]) sprite[mugRow - 1][steamCol1] = BREAK_COFFEE_STEAM_COLOR_1;
    if (sprite[mugRow - 2]) sprite[mugRow - 2][steamCol2] = BREAK_COFFEE_STEAM_COLOR_2;
    if (sprite[mugRow - 3]) sprite[mugRow - 3][steamCol1] = BREAK_COFFEE_STEAM_COLOR_1;
  }

  return sprite;
}

/** Render a snack/donut with nibbling animation */
function renderSnackBreakSprite(base: SpriteData, frame: number, dir: Direction): SpriteData {
  const sprite = cloneSprite(base);
  const rows = sprite.length;
  const cols = sprite[0]?.length ?? 0;
  if (rows < 24 || cols < 16) return sprite;

  const isRight = dir === Direction.RIGHT;
  const isLeft = dir === Direction.LEFT;
  const snackCol = isRight ? 9 : isLeft ? 5 : 7;
  const isNibble = frame % 2 === 1;
  const snackRow = isNibble ? 17 : 19;

  if (sprite[snackRow] && sprite[snackRow + 1]) {
    sprite[snackRow][snackCol] = BREAK_SNACK_FROSTING_COLOR;
    sprite[snackRow][snackCol + 1] = BREAK_SNACK_FROSTING_COLOR;
    sprite[snackRow + 1][snackCol] = BREAK_SNACK_BASE_COLOR;
    sprite[snackRow + 1][snackCol + 1] = BREAK_SNACK_BASE_COLOR;

    if (isNibble && sprite[snackRow + 2]) {
      sprite[snackRow + 2][snackCol - 1] = BREAK_SNACK_CRUMB_COLOR;
    }
  }

  return sprite;
}

/** Render handheld Steam Deck console with vibrant animated gaming screen */
function renderSteamDeckBreakSprite(base: SpriteData, frame: number): SpriteData {
  const sprite = cloneSprite(base);
  const rows = sprite.length;
  const cols = sprite[0]?.length ?? 0;
  if (rows < 24 || cols < 16) return sprite;

  const deckRow = 19;
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

  const screenPalette = [
    [BREAK_STEAMDECK_SCREEN_ON_1, BREAK_STEAMDECK_SCREEN_ON_2, BREAK_STEAMDECK_SCREEN_ON_3],
    [BREAK_STEAMDECK_SCREEN_ON_2, BREAK_STEAMDECK_GLOW_COLOR, BREAK_STEAMDECK_SCREEN_ON_1],
    [BREAK_STEAMDECK_SCREEN_ON_3, BREAK_STEAMDECK_SCREEN_ON_1, BREAK_STEAMDECK_SCREEN_ON_2],
    [BREAK_STEAMDECK_GLOW_COLOR, BREAK_STEAMDECK_SCREEN_ON_3, BREAK_STEAMDECK_SCREEN_ON_1],
  ];
  const curPal = screenPalette[frame % 4];

  for (let r = 0; r < 2; r++) {
    const curRow = deckRow + r;
    if (!sprite[curRow]) continue;
    for (let c = deckStartCol + 2; c <= deckStartCol + 7; c++) {
      const colorIdx = (c + r + frame) % 3;
      sprite[curRow][c] = curPal[colorIdx];
    }
  }

  return sprite;
}

/** Get the correct sprite frame for a character's current state and direction */
export function getCharacterSprite(ch: Character, sprites: CharacterSprites): SpriteData {
  switch (ch.state) {
    case CharacterState.TYPE:
      if (isReadingTool(ch.currentTool)) {
        return sprites.reading[ch.dir][ch.frame % 2];
      }
      return sprites.typing[ch.dir][ch.frame % 2];
    case CharacterState.WALK:
      return sprites.walk[ch.dir][ch.frame % 4];
    case CharacterState.IDLE:
      return sprites.walk[ch.dir][1];
    case CharacterState.BREAK_COFFEE:
      return renderCoffeeBreakSprite(sprites.walk[ch.dir][1], ch.frame, ch.dir);
    case CharacterState.BREAK_SNACK:
      return renderSnackBreakSprite(sprites.walk[ch.dir][1], ch.frame, ch.dir);
    case CharacterState.BREAK_STEAMDECK:
      return renderSteamDeckBreakSprite(sprites.walk[ch.dir][1], ch.frame);
    default:
      return sprites.walk[ch.dir][1];
  }
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
