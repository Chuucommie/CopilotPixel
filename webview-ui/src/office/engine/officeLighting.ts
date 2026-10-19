import {
  LIGHTING_CHARACTER_MONITOR,
  LIGHTING_CLOCK_COLOR,
  LIGHTING_COFFEE_COLOR,
  LIGHTING_DAY_AMBIENT,
  LIGHTING_EVENING_AMBIENT_PREFIX,
  LIGHTING_FRIDGE_COLOR,
  LIGHTING_GRADIENT_STOP_CLEAR,
  LIGHTING_GRADIENT_STOP_DARK,
  LIGHTING_MICROWAVE_COLOR,
  LIGHTING_MONITOR_COLOR,
  LIGHTING_MUG_COLOR,
  LIGHTING_NIGHT_AMBIENT_PREFIX,
  LIGHTING_STEAMDECK_COLOR,
  LIGHTING_STOVETOP_COLOR,
  LIGHTING_TEA_COLOR,
} from '../../constants.js';
import type { Character, FurnitureInstance } from '../types.js';
import { CharacterState } from '../types.js';

/**
 * Office Dynamic Lighting & Day/Night Cycle
 * Syncs with the user's real local time:
 * - Daytime (06:00 - 18:00): Natural bright daylight (darkness: 0)
 * - Evening (18:00 - 21:00): Warm soft ambient light ('luci soffuse')
 * - Night (after 21:00, 21:00 - 06:00): Ceiling lights OFF ('spente'), dark room,
 *   agents illuminated strictly by device lights (monitors, laptops, Steam Deck, appliance LEDs)
 */

export type LightingPhase = 'day' | 'evening' | 'night';

export interface LightSource {
  /** Center X in world pixels */
  x: number;
  /** Center Y in world pixels */
  y: number;
  /** Radius in world pixels */
  radius: number;
  /** Glow color */
  color: string;
  /** Brightness multiplier 0..1 */
  intensity: number;
  /** Semantic type */
  kind: 'monitor' | 'steamdeck' | 'appliance' | 'clock' | 'ambient';
}

export interface LightingState {
  phase: LightingPhase;
  /** 0 = full daylight, 0.25..0.45 = evening dim, 0.84 = night darkness */
  darkness: number;
  /** Ambient darkness RGBA string */
  ambientColor: string;
  /** Active device light sources */
  lightSources: LightSource[];
}

/**
 * Determine the lighting phase for a given time.
 */
export function getLightingPhase(now = new Date()): LightingPhase {
  const hour = now.getHours() + now.getMinutes() / 60;
  if (hour >= 21 || hour < 6) return 'night';
  if (hour >= 18 && hour < 21) return 'evening';
  return 'day';
}

/**
 * Calculate the ambient darkness factor (0 to 0.85).
 */
export function getLightingDarkness(now = new Date()): number {
  const hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;

  // Night: 21:00 to 06:00
  if (hour >= 21 || hour < 6) {
    return 0.84;
  }

  // Evening: 18:00 to 21:00 (luci soffuse: progressively gentle dim from 0.15 to 0.45)
  if (hour >= 18 && hour < 21) {
    const progress = (hour - 18) / 3;
    return 0.15 + progress * 0.32;
  }

  // Dawn transition: 06:00 to 07:00 (night fades into full daylight)
  if (hour >= 6 && hour < 7) {
    const progress = hour - 6;
    return 0.84 * (1 - progress);
  }

  // Full day: 07:00 to 18:00
  return 0;
}

/**
 * Calculate the ambient color based on phase and darkness.
 */
export function getAmbientColor(phase: LightingPhase, darkness: number): string {
  if (phase === 'night') {
    return `${LIGHTING_NIGHT_AMBIENT_PREFIX}${darkness.toFixed(3)})`;
  }
  if (phase === 'evening') {
    // Warm twilight amber-tinted ambient
    return `${LIGHTING_EVENING_AMBIENT_PREFIX}${darkness.toFixed(3)})`;
  }
  // Daytime
  return LIGHTING_DAY_AMBIENT;
}

/**
 * Collect all active device light sources from the office environment.
 */
export function collectLightSources(
  furniture: FurnitureInstance[],
  characters: Character[],
  now = new Date(),
): LightSource[] {
  const phase = getLightingPhase(now);
  if (phase === 'day') return [];

  const lights: LightSource[] = [];

  // 1. Monitors & PC workstations
  for (const f of furniture) {
    const fType = f.type || '';
    if (fType.startsWith('PC_') || fType === 'DESK_FRONT') {
      lights.push({
        x: f.x + 8,
        y: f.y + 12,
        radius: phase === 'night' ? 36 : 28,
        color: LIGHTING_MONITOR_COLOR,
        intensity: phase === 'night' ? 0.95 : 0.6,
        kind: 'monitor',
      });
    } else if (fType === 'COFFEE_MACHINE') {
      lights.push({
        x: f.x + 8,
        y: f.y + 16,
        radius: 22,
        color: LIGHTING_COFFEE_COLOR,
        intensity: 0.8,
        kind: 'appliance',
      });
    } else if (fType === 'TEA_STATION') {
      lights.push({
        x: f.x + 8,
        y: f.y + 14,
        radius: 18,
        color: LIGHTING_TEA_COLOR,
        intensity: 0.7,
        kind: 'appliance',
      });
    } else if (fType === 'MICROWAVE') {
      lights.push({
        x: f.x + 8,
        y: f.y + 12,
        radius: 18,
        color: LIGHTING_MICROWAVE_COLOR,
        intensity: 0.75,
        kind: 'appliance',
      });
    } else if (fType === 'KITCHEN_FRIDGE') {
      lights.push({
        x: f.x + 8,
        y: f.y + 16,
        radius: 16,
        color: LIGHTING_FRIDGE_COLOR,
        intensity: 0.5,
        kind: 'appliance',
      });
    } else if (fType === 'KITCHEN_STOVETOP') {
      lights.push({
        x: f.x + 8,
        y: f.y + 16,
        radius: 18,
        color: LIGHTING_STOVETOP_COLOR,
        intensity: 0.65,
        kind: 'appliance',
      });
    } else if (fType === 'CLOCK') {
      // Subtle clock face glow so time can be read at night
      lights.push({
        x: f.x + 8,
        y: f.y + 16,
        radius: 15,
        color: LIGHTING_CLOCK_COLOR,
        intensity: 0.5,
        kind: 'clock',
      });
    }
  }

  // 2. Characters with devices (laptops, Steam Deck, working monitors)
  for (const ch of characters) {
    if (ch.matrixEffect === 'despawn') continue;

    // Working or seated at desk: illuminate character from monitor
    if (ch.state === CharacterState.TYPE || ch.isSitting) {
      lights.push({
        x: ch.x,
        y: ch.y - 6,
        radius: phase === 'night' ? 34 : 26,
        color: LIGHTING_CHARACTER_MONITOR,
        intensity: 0.9,
        kind: 'monitor',
      });
    }

    // Break Room handheld console (Steam Deck)
    if (ch.breakType === 'steamdeck') {
      lights.push({
        x: ch.x,
        y: ch.y - 8,
        radius: phase === 'night' ? 24 : 18,
        color: LIGHTING_STEAMDECK_COLOR,
        intensity: 0.95,
        kind: 'steamdeck',
      });
    } else if (ch.breakType === 'coffee' || ch.breakType === 'tea') {
      lights.push({
        x: ch.x,
        y: ch.y - 6,
        radius: 15,
        color: LIGHTING_MUG_COLOR,
        intensity: 0.6,
        kind: 'appliance',
      });
    }
  }

  return lights;
}

/**
 * Get the full lighting state.
 */
export function getLightingState(
  furniture: FurnitureInstance[] = [],
  characters: Character[] = [],
  now = new Date(),
): LightingState {
  const phase = getLightingPhase(now);
  const darkness = getLightingDarkness(now);
  const ambientColor = getAmbientColor(phase, darkness);
  const lightSources = collectLightSources(furniture, characters, now);

  return {
    phase,
    darkness,
    ambientColor,
    lightSources,
  };
}

let offscreenCanvas: HTMLCanvasElement | null = null;
let offscreenCtx: CanvasRenderingContext2D | null = null;

/**
 * Render the ambient darkness and device light glows.
 */
export function renderOfficeLighting(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
  lighting: LightingState,
): void {
  if (lighting.darkness <= 0.01) return;

  // Lazy instantiate offscreen canvas
  if (
    !offscreenCanvas ||
    offscreenCanvas.width !== canvasWidth ||
    offscreenCanvas.height !== canvasHeight
  ) {
    if (typeof document !== 'undefined') {
      offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = canvasWidth;
      offscreenCanvas.height = canvasHeight;
      offscreenCtx = offscreenCanvas.getContext('2d');
    }
  }

  if (!offscreenCanvas || !offscreenCtx) return;

  // 1. Fill offscreen with ambient darkness
  offscreenCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  offscreenCtx.globalCompositeOperation = 'source-over';
  offscreenCtx.fillStyle = lighting.ambientColor;
  offscreenCtx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 2. Punch transparent apertures where devices glow (destination-out)
  offscreenCtx.globalCompositeOperation = 'destination-out';
  for (const src of lighting.lightSources) {
    const sx = Math.round(offsetX + src.x * zoom);
    const sy = Math.round(offsetY + src.y * zoom);
    const sRadius = src.radius * zoom;

    const grad = offscreenCtx.createRadialGradient(sx, sy, 2 * zoom, sx, sy, sRadius);
    grad.addColorStop(0, `${LIGHTING_GRADIENT_STOP_DARK}${src.intensity})`);
    grad.addColorStop(0.4, `${LIGHTING_GRADIENT_STOP_DARK}${src.intensity * 0.75})`);
    grad.addColorStop(1, LIGHTING_GRADIENT_STOP_CLEAR);

    offscreenCtx.fillStyle = grad;
    offscreenCtx.beginPath();
    offscreenCtx.arc(sx, sy, sRadius, 0, Math.PI * 2);
    offscreenCtx.fill();
  }

  // 3. Add soft colored glow around apertures
  offscreenCtx.globalCompositeOperation = 'source-over';
  for (const src of lighting.lightSources) {
    const sx = Math.round(offsetX + src.x * zoom);
    const sy = Math.round(offsetY + src.y * zoom);
    const sRadius = src.radius * zoom;

    const colorGrad = offscreenCtx.createRadialGradient(sx, sy, 1 * zoom, sx, sy, sRadius);
    colorGrad.addColorStop(0, src.color);
    colorGrad.addColorStop(1, LIGHTING_GRADIENT_STOP_CLEAR);

    offscreenCtx.fillStyle = colorGrad;
    offscreenCtx.beginPath();
    offscreenCtx.arc(sx, sy, sRadius, 0, Math.PI * 2);
    offscreenCtx.fill();
  }

  // 4. Blit darkness layer onto main canvas
  ctx.save();
  ctx.drawImage(offscreenCanvas, 0, 0);
  ctx.restore();
}
