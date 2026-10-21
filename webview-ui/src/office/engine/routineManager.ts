/**
 * Radiant AI Routine Manager (inspired by The Elder Scrolls: Skyrim / Oblivion)
 *
 * Directs idle agents to perform daily life routines based on the real-world
 * workspace local time (new Date().getHours(), new Date().getMinutes()).
 *
 * Each agent has a unique personality, schedule, preferred spots, and dialogue.
 */

import { CharacterState } from '../types.js';
import type { OfficeState } from './officeState.js';

export type TimePhase =
  | 'MORNING_ROUTINE' // 07:00 - 09:30: Breakfast, espresso, tea, morning greetings
  | 'MORNING_FOCUS' // 09:30 - 12:30: Workstations & collaborative architecture
  | 'LUNCH_HOUR' // 12:30 - 14:15: Cooking at stovetop, microwave, dining table chatting
  | 'AFTERNOON_SPRINT' // 14:15 - 17:00: Deep sprint, code review, 15:00 coffee boost
  | 'EVENING_LOUNGE' // 17:00 - 19:30: Steam Deck gaming tournament, couch chill, novels
  | 'NIGHT_SHIFT'; // 19:30 - 07:00: Night owls, late-night tea, serene hacking

export interface RoutineActivity {
  phase: TimePhase;
  activityName: string;
  icon: string;
  targetType:
    | 'workstation'
    | 'fridge'
    | 'kitchen_sink'
    | 'stovetop'
    | 'microwave'
    | 'espresso'
    | 'tea'
    | 'snack_bar'
    | 'dining_table'
    | 'sofa_steamdeck'
    | 'sofa_lounge';
  breakType?: 'coffee' | 'tea' | 'snack' | 'steamdeck';
  dialogueLines: string[];
}

export function getCurrentTimePhase(date: Date = new Date()): {
  phase: TimePhase;
  hour: number;
  minute: number;
  timeStr: string;
} {
  const hour = date.getHours();
  const minute = date.getMinutes();
  const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

  if (hour >= 7 && (hour < 9 || (hour === 9 && minute < 30))) {
    return { phase: 'MORNING_ROUTINE', hour, minute, timeStr };
  } else if (
    (hour === 9 && minute >= 30) ||
    (hour >= 10 && hour < 12) ||
    (hour === 12 && minute < 30)
  ) {
    return { phase: 'MORNING_FOCUS', hour, minute, timeStr };
  } else if ((hour === 12 && minute >= 30) || hour === 13 || (hour === 14 && minute < 15)) {
    return { phase: 'LUNCH_HOUR', hour, minute, timeStr };
  } else if ((hour === 14 && minute >= 15) || (hour >= 15 && hour < 17)) {
    return { phase: 'AFTERNOON_SPRINT', hour, minute, timeStr };
  } else if (hour >= 17 && (hour < 19 || (hour === 19 && minute < 30))) {
    return { phase: 'EVENING_LOUNGE', hour, minute, timeStr };
  } else {
    return { phase: 'NIGHT_SHIFT', hour, minute, timeStr };
  }
}

/**
 * Determine an agent's individual persona profile and Elder Scrolls routine
 */
export function getAgentRoutineActivity(
  agentId: number,
  customName?: string,
  role?: string,
  date: Date = new Date(),
): RoutineActivity {
  const { phase, timeStr } = getCurrentTimePhase(date);
  const name = customName?.toLowerCase() || '';
  const agentRole = role?.toLowerCase() || '';

  // Determine personality archetype (0: Lead/Architect, 1: Gamer/Frontend, 2: Chef/Fullstack, 3: QA/Tea Connoisseur, 4: DevOps/Night Owl)
  let archetype = agentId % 5;
  if (name.includes('sophia') || agentRole.includes('full') || agentRole.includes('chef'))
    archetype = 2;
  else if (name.includes('liam') || agentRole.includes('front') || agentRole.includes('gamer'))
    archetype = 1;
  else if (name.includes('elena') || agentRole.includes('qa') || agentRole.includes('test'))
    archetype = 3;
  else if (name.includes('marcus') || agentRole.includes('lead') || agentRole.includes('architect'))
    archetype = 0;
  else if (name.includes('alex') || agentRole.includes('devops') || agentRole.includes('infra'))
    archetype = 4;

  switch (phase) {
    case 'MORNING_ROUTINE': {
      if (archetype === 0 || archetype === 4) {
        return {
          phase,
          activityName: 'Morning Espresso Kickstart',
          icon: '☕',
          targetType: 'espresso',
          breakType: 'coffee',
          dialogueLines: [
            `[${timeStr}] By the Nine, this double espresso gives +50 Stamina!`,
            `[${timeStr}] First coffee of the day. Zero bugs allowed today.`,
            `[${timeStr}] The barista in Solitude couldn't brew a cup this bold.`,
          ],
        };
      } else if (archetype === 2) {
        return {
          phase,
          activityName: 'Breakfast Pastries & Fruit',
          icon: '🥐',
          targetType: 'snack_bar',
          breakType: 'snack',
          dialogueLines: [
            `[${timeStr}] Sweetrolls and fresh croissants for the morning standup!`,
            `[${timeStr}] Someone tried to steal a sweetroll from the kitchen fridge...`,
            `[${timeStr}] Starting the morning with good energy and fresh fruit.`,
          ],
        };
      } else if (archetype === 3) {
        return {
          phase,
          activityName: 'Herbal Tea Ceremony',
          icon: '🍵',
          targetType: 'tea',
          breakType: 'tea',
          dialogueLines: [
            `[${timeStr}] Green tea with a touch of honey before inspecting tests.`,
            `[${timeStr}] The tea leaves foretell a clean build pipeline.`,
            `[${timeStr}] A peaceful morning tea sets the mind into harmony.`,
          ],
        };
      } else {
        return {
          phase,
          activityName: 'Morning Lounge Banter',
          icon: '🛋️',
          targetType: 'sofa_lounge',
          breakType: 'coffee',
          dialogueLines: [
            `[${timeStr}] Morning team! Who else stayed up playing Skyrim?`,
            `[${timeStr}] Ready for another day in Tamriel... err, TypeScript.`,
            `[${timeStr}] Checking morning notifications on the sofa.`,
          ],
        };
      }
    }

    case 'MORNING_FOCUS': {
      if (archetype === 0 || archetype === 4) {
        return {
          phase,
          activityName: 'Core Architecture & Code Review',
          icon: '💻',
          targetType: 'workstation',
          dialogueLines: [
            `[${timeStr}] Reviewing PRs. Architecture must remain bulletproof.`,
            `[${timeStr}] I used to be an engineer like you, until I took a NullPointer to the knee.`,
            `[${timeStr}] Refactoring clean abstractions. All unit tests green.`,
          ],
        };
      } else if (archetype === 3) {
        return {
          phase,
          activityName: 'Automated QA & Integration Tests',
          icon: '🧪',
          targetType: 'workstation',
          dialogueLines: [
            `[${timeStr}] Running 524 integration tests across the codebase.`,
            `[${timeStr}] Found a subtle race condition before it hit production!`,
            `[${timeStr}] Coverage is at 98.4%. Quality above all else.`,
          ],
        };
      } else {
        return {
          phase,
          activityName: 'Deep Feature Implementation',
          icon: '⚡',
          targetType: 'workstation',
          dialogueLines: [
            `[${timeStr}] Flow state achieved. Writing high-performance code.`,
            `[${timeStr}] Clean commits, typed interfaces, and zero lint errors.`,
            `[${timeStr}] In the heat of code, like an Imperial blacksmith forging armor.`,
          ],
        };
      }
    }

    case 'LUNCH_HOUR': {
      if (archetype === 2) {
        // Master Chef cooking at the stove!
        return {
          phase,
          activityName: 'Cooking Lunch at Stovetop',
          icon: '🍳',
          targetType: 'stovetop',
          breakType: 'snack',
          dialogueLines: [
            `[${timeStr}] The gas burners are lit! Gourmet lunch for the team!`,
            `[${timeStr}] Sizzling garlic, herbs, and homemade pasta on the fuochi.`,
            `[${timeStr}] A true chef never relies on store-bought potions!`,
          ],
        };
      } else if (archetype === 1) {
        return {
          phase,
          activityName: 'Heating Lunch in Microwave',
          icon: '🍲',
          targetType: 'microwave',
          breakType: 'snack',
          dialogueLines: [
            `[${timeStr}] Heating up lasagna in the microwave. 45 seconds to go!`,
            `[${timeStr}] Microwave timer beeped. Time for lunch!`,
            `[${timeStr}] Nothing beats a quick warm lunch between coding sessions.`,
          ],
        };
      } else if (archetype === 3 || archetype === 0) {
        return {
          phase,
          activityName: 'Lunch & Tech Banter at Dining Table',
          icon: '🥗',
          targetType: 'dining_table',
          breakType: 'snack',
          dialogueLines: [
            `[${timeStr}] Join us at the dining table! The food smells delicious.`,
            `[${timeStr}] Let me guess, someone pushed to main during lunch?`,
            `[${timeStr}] Discussing distributed systems over lunch.`,
          ],
        };
      } else {
        return {
          phase,
          activityName: 'Relaxing on Couch with Espresso',
          icon: '☕',
          targetType: 'sofa_lounge',
          breakType: 'coffee',
          dialogueLines: [
            `[${timeStr}] Mid-day rest on the sofa. Recharging energy for the afternoon.`,
            `[${timeStr}] Post-lunch coffee is an essential ritual.`,
            `[${timeStr}] The break room couch is the comfiest spot in the guild.`,
          ],
        };
      }
    }

    case 'AFTERNOON_SPRINT': {
      if (archetype === 4 || archetype === 0) {
        return {
          phase,
          activityName: '15:00 Espresso & Sprint Review',
          icon: '☕',
          targetType: 'espresso',
          breakType: 'coffee',
          dialogueLines: [
            `[${timeStr}] 15:00 Espresso boost! Critical for the afternoon deployment.`,
            `[${timeStr}] Fresh crema in the cup. Back to the terminal!`,
            `[${timeStr}] Double shot pulled with perfect 9 bar pressure.`,
          ],
        };
      } else {
        return {
          phase,
          activityName: 'Afternoon Sprint & Debugging',
          icon: '💻',
          targetType: 'workstation',
          dialogueLines: [
            `[${timeStr}] Smashing through tickets in the afternoon sprint.`,
            `[${timeStr}] You have a problem. You use regex. Now you have two problems.`,
            `[${timeStr}] Bug reproduced, fixed, and verified with a unit test.`,
          ],
        };
      }
    }

    case 'EVENING_LOUNGE': {
      if (archetype === 1 || archetype === 2) {
        // Gamer archetype: Steam Deck tournament!
        return {
          phase,
          activityName: 'Steam Deck Gaming Tournament',
          icon: '🎮',
          targetType: 'sofa_steamdeck',
          breakType: 'steamdeck',
          dialogueLines: [
            `[${timeStr}] 17:00 sharp! Steam Deck tournament time on the sofa!`,
            `[${timeStr}] Playing Elden Ring on the Steam Deck! Beat the boss on 1 HP!`,
            `[${timeStr}] Who wants next round? Fast travel straight to Whiterun!`,
          ],
        };
      } else if (archetype === 3) {
        return {
          phase,
          activityName: 'Evening Tea & Reading',
          icon: '📖',
          targetType: 'sofa_lounge',
          breakType: 'tea',
          dialogueLines: [
            `[${timeStr}] Relaxing with chamomile tea and reading tech blogs.`,
            `[${timeStr}] Reflecting on the day's achievements in peace.`,
            `[${timeStr}] All test suites passed with 100% green builds.`,
          ],
        };
      } else {
        return {
          phase,
          activityName: 'Evening Wrap-Up & Chat',
          icon: '🛋️',
          targetType: 'dining_table',
          breakType: 'coffee',
          dialogueLines: [
            `[${timeStr}] Great sprint today, team! Excellent work on the features.`,
            `[${timeStr}] Winding down the day with casual banter at the table.`,
            `[${timeStr}] Tomorrow we ship the next release!`,
          ],
        };
      }
    }

    case 'NIGHT_SHIFT': {
      if (archetype === 4 || archetype === 1) {
        return {
          phase,
          activityName: 'Night Owl Hacking',
          icon: '🦉',
          targetType: 'workstation',
          dialogueLines: [
            `[${timeStr}] Night owl shift. Silence, dark mode, and terminal bliss.`,
            `[${timeStr}] Never should have opened this branch at midnight...`,
            `[${timeStr}] The servers are peaceful under the starry night sky.`,
          ],
        };
      } else {
        return {
          phase,
          activityName: 'Late Night Herbal Tea & Calm',
          icon: '🍵',
          targetType: 'tea',
          breakType: 'tea',
          dialogueLines: [
            `[${timeStr}] Late night cup of peppermint tea.`,
            `[${timeStr}] Rest well, weary traveler of the code base.`,
            `[${timeStr}] Peace falls over the office. Good night!`,
          ],
        };
      }
    }
  }
}

/**
 * Periodically evaluate idle agents and transition them into their Elder Scrolls routine
 */
export class RadiantRoutineEngine {
  private lastEvaluationTime = 0;
  private evaluationIntervalSec = 18; // check every 18 seconds

  update(os: OfficeState, dt: number): void {
    this.lastEvaluationTime += dt;
    if (this.lastEvaluationTime < this.evaluationIntervalSec) return;
    this.lastEvaluationTime = 0;

    const characters = Array.from(os.getCharacters().values());
    const now = new Date();

    for (const ch of characters) {
      // If agent is active on a real task or running an order, routine yields immediately!
      if (ch.isActive || (ch.currentOrder && ch.orderStatus === 'running') || ch.matrixEffect) {
        continue;
      }

      // If character is currently walking along a path, let them finish
      if (ch.path && ch.path.length > 0) continue;

      const routine = getAgentRoutineActivity(ch.id, ch.customName, ch.role, now);
      ch.routineActivity = routine.activityName;
      ch.routineIcon = routine.icon;

      // Check if character should transition to their routine spot
      if (routine.targetType === 'workstation') {
        if (ch.isTakingBreak) {
          os.returnAgentFromBreak(ch.id);
        }
      } else {
        // Target is a break room activity
        const breakSpots = os.getBreakRoomSpots();
        let chosenSpot = null;

        if (routine.targetType === 'fridge') {
          chosenSpot = breakSpots.find((s) => s.col <= 11 && s.row === 12);
        } else if (routine.targetType === 'kitchen_sink') {
          chosenSpot = breakSpots.find((s) => s.col === 12 && s.row === 12);
        } else if (routine.targetType === 'stovetop') {
          chosenSpot = breakSpots.find(
            (s) => s.state === CharacterState.BREAK_SNACK && s.col >= 14 && s.col <= 16,
          );
        } else if (routine.targetType === 'microwave') {
          chosenSpot = breakSpots.find((s) => s.col >= 17 && s.col <= 18);
        } else if (routine.targetType === 'espresso') {
          chosenSpot = breakSpots.find(
            (s) => s.breakType === 'coffee' && s.col >= 19 && s.col <= 20,
          );
        } else if (routine.targetType === 'tea') {
          chosenSpot = breakSpots.find((s) => s.breakType === 'tea');
        } else if (routine.targetType === 'snack_bar') {
          chosenSpot = breakSpots.find(
            (s) => s.breakType === 'snack' && s.col >= 20 && s.col <= 22,
          );
        } else if (routine.targetType === 'sofa_steamdeck') {
          chosenSpot = breakSpots.find((s) => s.breakType === 'steamdeck' && s.isSitting);
        } else if (routine.targetType === 'sofa_lounge') {
          chosenSpot = breakSpots.find(
            (s) => s.isSitting && (s.breakType === 'coffee' || s.breakType === 'tea'),
          );
        } else if (routine.targetType === 'dining_table') {
          chosenSpot = breakSpots.find((s) => s.isSitting && s.col >= 22 && s.col <= 25);
        }

        if (!chosenSpot && breakSpots.length > 0) {
          chosenSpot = breakSpots[ch.id % breakSpots.length];
        }

        if (chosenSpot) {
          const isAtSpot = ch.tileCol === chosenSpot.col && ch.tileRow === chosenSpot.row;
          if (!ch.isTakingBreak || !isAtSpot) {
            os.startAgentBreak(ch.id, routine.breakType || chosenSpot.breakType, chosenSpot);
          }
        }
      }

      // 25% chance to speak an authentic Elder Scrolls / dev routine line in speech bubble
      if (!ch.speechBubbleText && Math.random() < 0.25) {
        const line =
          routine.dialogueLines[Math.floor(Math.random() * routine.dialogueLines.length)];
        os.addTeamDialogue({
          fromAgentId: ch.id,
          fromName: ch.customName || `Agent #${ch.id}`,
          fromRole: ch.role || 'Teammate',
          text: line,
          context: 'break_room',
        });
      }
    }
  }
}
