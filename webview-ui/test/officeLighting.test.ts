import { describe, expect, it } from 'vitest';

import {
  getAmbientColor,
  getLightingDarkness,
  getLightingPhase,
  getLightingState,
} from '../src/office/engine/officeLighting.js';
import type { Character, FurnitureInstance } from '../src/office/types.js';
import { CharacterState, Direction } from '../src/office/types.js';

describe('officeLighting', () => {
  it('identifies daytime correctly (07:00 - 18:00)', () => {
    expect(getLightingPhase(new Date(2026, 9, 19, 12, 0, 0))).toBe('day');
    expect(getLightingPhase(new Date(2026, 9, 19, 8, 30, 0))).toBe('day');
    expect(getLightingPhase(new Date(2026, 9, 19, 17, 59, 0))).toBe('day');
    expect(getLightingDarkness(new Date(2026, 9, 19, 14, 0, 0))).toBe(0);
  });

  it('identifies evening correctly (18:00 - 21:00) with soft dim lighting', () => {
    expect(getLightingPhase(new Date(2026, 9, 19, 18, 0, 0))).toBe('evening');
    expect(getLightingPhase(new Date(2026, 9, 19, 19, 30, 0))).toBe('evening');
    expect(getLightingPhase(new Date(2026, 9, 19, 20, 59, 0))).toBe('evening');

    const eveningDarkness = getLightingDarkness(new Date(2026, 9, 19, 19, 30, 0));
    expect(eveningDarkness).toBeGreaterThanOrEqual(0.15);
    expect(eveningDarkness).toBeLessThanOrEqual(0.5);

    const ambient = getAmbientColor('evening', eveningDarkness);
    expect(ambient).toContain('rgba(24, 18, 36');
  });

  it('identifies night correctly (after 21:00 and before 06:00) with ceiling lights off', () => {
    expect(getLightingPhase(new Date(2026, 9, 19, 21, 0, 0))).toBe('night');
    expect(getLightingPhase(new Date(2026, 9, 19, 23, 15, 0))).toBe('night');
    expect(getLightingPhase(new Date(2026, 9, 19, 2, 0, 0))).toBe('night');
    expect(getLightingPhase(new Date(2026, 9, 19, 5, 59, 0))).toBe('night');

    const nightDarkness = getLightingDarkness(new Date(2026, 9, 19, 22, 0, 0));
    expect(nightDarkness).toBeCloseTo(0.84, 2);

    const ambient = getAmbientColor('night', nightDarkness);
    expect(ambient).toContain('rgba(8, 12, 26');
  });

  it('collects device light sources at night to illuminate agents and appliances', () => {
    const furniture: FurnitureInstance[] = [
      {
        type: 'PC_FRONT',
        x: 100,
        y: 100,
        zY: 116,
        sprite: [],
      },
      {
        type: 'COFFEE_MACHINE',
        x: 200,
        y: 50,
        zY: 66,
        sprite: [],
      },
      {
        type: 'CLOCK',
        x: 80,
        y: 30,
        zY: 46,
        sprite: [],
      },
    ];

    const characters: Character[] = [
      {
        id: 1,
        palette: 0,
        hueShift: 0,
        x: 100,
        y: 110,
        tileCol: 6,
        tileRow: 6,
        dir: Direction.UP,
        state: CharacterState.TYPE,
        isSitting: true,
        frame: 0,
        path: [],
        moveProgress: 0,
        seatId: 'seat-1',
        isSubagent: false,
        seatTimer: 0,
        bubbleType: null,
        bubbleTimer: 0,
        isActive: true,
        contextTokens: 0,
        maxContextTokens: 200000,
      } as unknown as Character,
      {
        id: 2,
        palette: 1,
        hueShift: 0,
        x: 180,
        y: 120,
        tileCol: 11,
        tileRow: 7,
        dir: Direction.DOWN,
        state: CharacterState.IDLE,
        isSitting: true,
        isTakingBreak: true,
        breakType: 'steamdeck',
        frame: 0,
        path: [],
        moveProgress: 0,
        seatId: null,
        isSubagent: true,
        seatTimer: 0,
        bubbleType: null,
        bubbleTimer: 0,
        isActive: false,
        contextTokens: 0,
        maxContextTokens: 200000,
      } as unknown as Character,
    ];

    const nightDate = new Date(2026, 9, 19, 22, 30, 0);
    const state = getLightingState(furniture, characters, nightDate);

    expect(state.phase).toBe('night');
    expect(state.darkness).toBeCloseTo(0.84, 2);
    expect(state.lightSources.length).toBeGreaterThanOrEqual(4);

    const monitorLight = state.lightSources.find((l) => l.kind === 'monitor');
    expect(monitorLight).toBeDefined();

    const steamdeckLight = state.lightSources.find((l) => l.kind === 'steamdeck');
    expect(steamdeckLight).toBeDefined();

    const applianceLight = state.lightSources.find((l) => l.kind === 'appliance');
    expect(applianceLight).toBeDefined();

    const clockLight = state.lightSources.find((l) => l.kind === 'clock');
    expect(clockLight).toBeDefined();
  });
});
