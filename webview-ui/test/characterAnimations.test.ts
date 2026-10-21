import { describe, expect, it } from 'vitest';

import {
  createCharacter,
  extractCharacterColors,
  getCharacterSprite,
} from '../src/office/engine/characters.js';
import type { CharacterSprites } from '../src/office/sprites/spriteData.js';
import type { Character } from '../src/office/types.js';
import { CharacterState, Direction } from '../src/office/types.js';

function makeTestSprite(): string[][] {
  const sprite: string[][] = [];
  for (let r = 0; r < 32; r++) {
    const row: string[] = [];
    for (let c = 0; c < 16; c++) {
      if (r >= 12 && r <= 16 && c >= 6 && c <= 9) {
        row.push('#e9a384'); // face skin
      } else if (r === 20 && (c === 3 || c === 12)) {
        row.push('#114978'); // sleeve
      } else if (r === 20 && c >= 6 && c <= 9) {
        row.push('#040605'); // torso
      } else if (r >= 21 && r <= 24 && (c === 1 || c === 2 || c === 13 || c === 14)) {
        row.push('#e9a384'); // static hanging arm in base
      } else {
        row.push('');
      }
    }
    sprite.push(row);
  }
  return sprite;
}

function makeMockSprites(): CharacterSprites {
  const s = makeTestSprite();
  return {
    walk: {
      [Direction.DOWN]: [s, s, s, s],
      [Direction.UP]: [s, s, s, s],
      [Direction.RIGHT]: [s, s, s, s],
      [Direction.LEFT]: [s, s, s, s],
    },
    typing: {
      [Direction.DOWN]: [s, s],
      [Direction.UP]: [s, s],
      [Direction.RIGHT]: [s, s],
      [Direction.LEFT]: [s, s],
    },
    reading: {
      [Direction.DOWN]: [s, s],
      [Direction.UP]: [s, s],
      [Direction.RIGHT]: [s, s],
      [Direction.LEFT]: [s, s],
    },
  };
}

describe('Character Animation & Arm Movement', () => {
  it('extracts skin, sleeve, and torso colors correctly', () => {
    const s = makeTestSprite();
    const colors = extractCharacterColors(s);
    expect(colors.skin).toBe('#e9a384');
    expect(colors.sleeve).toBe('#114978');
    expect(colors.torso).toBe('#040605');
  });

  it('removes hanging side arms and renders animated sleeves/hands when drinking coffee', () => {
    const sprites = makeMockSprites();
    const ch: Character = {
      ...createCharacter(1, 0, null, null),
      id: 1,
      customName: 'Alice',
      tileCol: 10,
      tileRow: 10,
      x: 160,
      y: 160,
      dir: Direction.DOWN,
      state: CharacterState.BREAK_COFFEE,
      breakType: 'coffee',
      isTakingBreak: true,
      hasCoffeeCup: true,
      coffeeCupState: 'full',
      isSitting: false,
      frame: 0,
      frameTimer: 0,
      currentTool: null,
      palette: 0,
      hueShift: 0,
      wanderTimer: 0,
      wanderCount: 0,
      wanderLimit: 5,
      seatId: null,
      path: [],
      moveProgress: 0,
      isActive: false,
    };

    // Phase 0: holding cup at chest
    const spritePhase0 = getCharacterSprite(ch, sprites);
    // Verify hanging outer arms at cols 1 and 14 are cleared
    expect(spritePhase0[22][1]).toBe('');
    expect(spritePhase0[22][14]).toBe('');
    // Verify sleeves are bent inward
    expect(spritePhase0[21][3]).toBe('#114978');
    expect(spritePhase0[21][12]).toBe('#114978');
    // Verify hands cup the mug at cols 6 and 9
    expect(spritePhase0[19][6]).toBe('#e9a384');
    expect(spritePhase0[19][9]).toBe('#e9a384');

    // Phase 2: sipping cup at mouth
    ch.frame = 2;
    const spritePhase2 = getCharacterSprite(ch, sprites);
    // Verify outer arms still cleared
    expect(spritePhase2[22][1]).toBe('');
    expect(spritePhase2[22][14]).toBe('');
    // Verify sleeves raised to support cup at mouth
    expect(spritePhase2[19][4]).toBe('#114978');
    expect(spritePhase2[19][11]).toBe('#114978');
    // Verify hands holding cup right at mouth
    expect(spritePhase2[16][6]).toBe('#e9a384');
    expect(spritePhase2[16][9]).toBe('#e9a384');
  });

  it('renders stable carrying arms when walking with a coffee cup', () => {
    const sprites = makeMockSprites();
    const ch: Character = {
      ...createCharacter(2, 0, null, null),
      id: 2,
      customName: 'Bob',
      tileCol: 5,
      tileRow: 5,
      x: 80,
      y: 80,
      dir: Direction.DOWN,
      state: CharacterState.WALK,
      hasCoffeeCup: true,
      coffeeCupState: 'full',
      isSitting: false,
      frame: 2, // walk step 2
      frameTimer: 0,
      currentTool: null,
      palette: 0,
      hueShift: 0,
      wanderTimer: 0,
      wanderCount: 0,
      wanderLimit: 5,
      seatId: null,
      path: [{ col: 6, row: 5 }],
      moveProgress: 0.5,
      isActive: false,
    };

    const spriteWalk = getCharacterSprite(ch, sprites);
    // Should hold cup stably in hands (not spilling or swinging)
    expect(spriteWalk[22][1]).toBe('');
    expect(spriteWalk[19][6]).toBe('#e9a384');
    expect(spriteWalk[19][9]).toBe('#e9a384');
  });

  it('renders operating arms when agent interacts with kitchen appliances', () => {
    const sprites = makeMockSprites();
    const ch: Character = {
      ...createCharacter(3, 0, null, null),
      id: 3,
      customName: 'Charlie',
      tileCol: 8,
      tileRow: 8,
      x: 128,
      y: 128,
      dir: Direction.UP,
      state: CharacterState.IDLE,
      kitchenAction: 'espresso',
      kitchenActionTimer: 0.5,
      isSitting: false,
      frame: 0,
      frameTimer: 0,
      currentTool: null,
      palette: 0,
      hueShift: 0,
      wanderTimer: 0,
      wanderCount: 0,
      wanderLimit: 5,
      seatId: null,
      path: [],
      moveProgress: 0,
      isActive: false,
    };

    const spriteKitchen = getCharacterSprite(ch, sprites);
    // Static rear arms cleared
    expect(spriteKitchen[22][1]).toBe('');
    expect(spriteKitchen[22][14]).toBe('');
    // Arms reaching up to espresso machine
    expect(spriteKitchen[19][3]).toBe('#114978');
    expect(spriteKitchen[19][12]).toBe('#114978');
    expect(spriteKitchen[17][5]).toBe('#e9a384');
  });
});
