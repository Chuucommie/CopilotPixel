import { describe, expect, it, vi } from 'vitest';

import { getClockHands, renderOfficeClock } from '../src/office/engine/officeClock.js';

describe('officeClock', () => {
  it('calculates exact 12:00:00 hand angles pointing straight up (-PI/2)', () => {
    const date = new Date(2026, 9, 19, 12, 0, 0, 0);
    const hands = getClockHands(date);

    expect(hands.hours).toBe(12);
    expect(hands.minutes).toBe(0);
    expect(hands.seconds).toBe(0);
    expect(hands.timeString).toBe('12:00:00');

    // At 12:00:00, all hands point straight up (-Math.PI / 2)
    expect(hands.hourAngle).toBeCloseTo(-Math.PI / 2, 4);
    expect(hands.minAngle).toBeCloseTo(-Math.PI / 2, 4);
    expect(hands.secAngle).toBeCloseTo(-Math.PI / 2, 4);
  });

  it('calculates 15:00:00 (3 PM) with hour hand pointing right (0 rad)', () => {
    const date = new Date(2026, 9, 19, 15, 0, 0, 0);
    const hands = getClockHands(date);

    expect(hands.hours).toBe(15);
    expect(hands.timeString).toBe('15:00:00');
    // 3 o'clock is 0 radians (standard trigonometric angle pointing right)
    expect(hands.hourAngle).toBeCloseTo(0, 4);
    expect(hands.minAngle).toBeCloseTo(-Math.PI / 2, 4);
  });

  it('calculates 18:30:00 (6:30 PM) angles correctly', () => {
    const date = new Date(2026, 9, 19, 18, 30, 0, 0);
    const hands = getClockHands(date);

    // At 6:30, minute hand points straight down (Math.PI / 2)
    expect(hands.minAngle).toBeCloseTo(Math.PI / 2, 4);
    // Hour hand is halfway between 6 and 7: Math.PI / 2 + Math.PI / 12
    expect(hands.hourAngle).toBeCloseTo(Math.PI / 2 + Math.PI / 12, 4);
  });

  it('renders clock on canvas context without errors', () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'round',
    } as unknown as CanvasRenderingContext2D;

    expect(() => {
      renderOfficeClock(mockCtx, 100, 100, 2, new Date(2026, 9, 19, 14, 30, 0));
    }).not.toThrow();

    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
    expect(mockCtx.stroke).toHaveBeenCalled();
    expect(mockCtx.fill).toHaveBeenCalled();
  });
});
