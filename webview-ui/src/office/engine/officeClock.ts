import {
  CLOCK_DIAL_BG,
  CLOCK_HOUR_HAND,
  CLOCK_MINUTE_HAND,
  CLOCK_PIVOT_PIN,
  CLOCK_RIM_BORDER,
  CLOCK_SECOND_HAND,
  CLOCK_TICK_PRIMARY,
  CLOCK_TICK_SECONDARY,
} from '../../constants.js';

/**
 * Office Wall Clock - Real-Time Animated Clock Renderer
 * Synchronizes office analog wall clocks with the user's real local time.
 */

export interface ClockHands {
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
  hourAngle: number;
  minAngle: number;
  secAngle: number;
  timeString: string;
}

/**
 * Compute hand rotation angles (in radians, 0 = 3 o'clock, -PI/2 = 12 o'clock)
 * for a given timestamp.
 */
export function getClockHands(now = new Date()): ClockHands {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const milliseconds = now.getMilliseconds();

  // Continuous angles for smooth, natural movement
  const totalHours = (hours % 12) + minutes / 60 + seconds / 3600;
  const totalMinutes = minutes + seconds / 60;
  const totalSeconds = seconds + milliseconds / 1000;

  // 12 o'clock is at -Math.PI / 2
  const hourAngle = (totalHours / 12) * Math.PI * 2 - Math.PI / 2;
  const minAngle = (totalMinutes / 60) * Math.PI * 2 - Math.PI / 2;
  const secAngle = (totalSeconds / 60) * Math.PI * 2 - Math.PI / 2;

  const pad = (n: number) => n.toString().padStart(2, '0');
  const timeString = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  return {
    hours,
    minutes,
    seconds,
    milliseconds,
    hourAngle,
    minAngle,
    secAngle,
    timeString,
  };
}

/**
 * Render real-time hands and dynamic dial markers on top of the clock sprite.
 * Center of the clock face in the standard 16x32 sprite is at (8, 16).
 */
export function renderOfficeClock(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  zoom: number,
  now = new Date(),
): void {
  // Center of the clock face in the standard 16x32 sprite is at (7.5, 15.5)
  // CLOCK.png has static hands at 10:10; a solid dial face of radius 4.8*zoom completely
  // blankets the static sprite hands and renders live, smoothly animated hands.
  const centerX = fx + 7.5 * zoom;
  const centerY = fy + 15.5 * zoom;
  const dialRadius = 4.8 * zoom;

  ctx.save();

  // 1. Clean dynamic dial face
  ctx.beginPath();
  ctx.arc(centerX, centerY, dialRadius, 0, Math.PI * 2);
  ctx.fillStyle = CLOCK_DIAL_BG;
  ctx.fill();

  // 2. Subtle rim outline
  ctx.beginPath();
  ctx.arc(centerX, centerY, dialRadius, 0, Math.PI * 2);
  ctx.strokeStyle = CLOCK_RIM_BORDER;
  ctx.lineWidth = Math.max(1, 0.7 * zoom);
  ctx.stroke();

  // 3. Hour markers (12, 3, 6, 9 major ticks + 8 minor ticks)
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const isMajor = i % 3 === 0;
    const innerR = dialRadius - (isMajor ? 1.4 * zoom : 0.8 * zoom);
    const outerR = dialRadius - 0.2 * zoom;

    const x1 = centerX + Math.cos(angle) * innerR;
    const y1 = centerY + Math.sin(angle) * innerR;
    const x2 = centerX + Math.cos(angle) * outerR;
    const y2 = centerY + Math.sin(angle) * outerR;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = isMajor ? CLOCK_TICK_PRIMARY : CLOCK_TICK_SECONDARY;
    ctx.lineWidth = isMajor ? Math.max(1, 0.9 * zoom) : Math.max(0.6, 0.5 * zoom);
    ctx.stroke();
  }

  // 4. Calculate real-time hands
  const { hourAngle, minAngle, secAngle } = getClockHands(now);

  // Hour hand (shorter, thick, dark)
  const hourLen = 2.6 * zoom;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX + Math.cos(hourAngle) * hourLen, centerY + Math.sin(hourAngle) * hourLen);
  ctx.strokeStyle = CLOCK_HOUR_HAND;
  ctx.lineWidth = Math.max(1.4, 1.6 * zoom);
  ctx.lineCap = 'round';
  ctx.stroke();

  // Minute hand (longer, medium dark)
  const minLen = 3.8 * zoom;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX + Math.cos(minAngle) * minLen, centerY + Math.sin(minAngle) * minLen);
  ctx.strokeStyle = CLOCK_MINUTE_HAND;
  ctx.lineWidth = Math.max(1.1, 1.1 * zoom);
  ctx.lineCap = 'round';
  ctx.stroke();

  // Second hand (vivid red, high contrast, smooth continuous sweep with counterweight tail)
  const secLen = 4.2 * zoom;
  const tailLen = 1.2 * zoom;
  ctx.beginPath();
  ctx.moveTo(centerX - Math.cos(secAngle) * tailLen, centerY - Math.sin(secAngle) * tailLen);
  ctx.lineTo(centerX + Math.cos(secAngle) * secLen, centerY + Math.sin(secAngle) * secLen);
  ctx.strokeStyle = CLOCK_SECOND_HAND;
  ctx.lineWidth = Math.max(0.8, 0.6 * zoom);
  ctx.lineCap = 'round';
  ctx.stroke();

  // 5. Pivot center pin
  ctx.beginPath();
  ctx.arc(centerX, centerY, Math.max(0.9, 0.8 * zoom), 0, Math.PI * 2);
  ctx.fillStyle = CLOCK_PIVOT_PIN;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(centerX, centerY, Math.max(0.4, 0.35 * zoom), 0, Math.PI * 2);
  ctx.fillStyle = CLOCK_HOUR_HAND;
  ctx.fill();

  ctx.restore();
}
