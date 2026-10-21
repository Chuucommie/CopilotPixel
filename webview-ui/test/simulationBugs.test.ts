import assert from 'node:assert/strict';

import { beforeEach, describe, it } from 'vitest';

import {
  clearCopilotPixelAgentsStore,
  saveOrUpdateCopilotPixelAgent,
} from '../src/office/engine/copilotPixelStore.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import type { BreakSpot, Seat } from '../src/office/types.js';
import { CharacterState, Direction } from '../src/office/types.js';

describe('Simulation and Flow Bug Fixes Regression Suite', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
      clearCopilotPixelAgentsStore();
    }
  });

  it('reassignSeat atomically retains current seat when target seat is already occupied', () => {
    const os = new OfficeState();
    os.seats.clear();
    const seatA: Seat = {
      uid: 'seat-a',
      seatCol: 2,
      seatRow: 2,
      facingDir: Direction.UP,
      assigned: true,
    };
    const seatB: Seat = {
      uid: 'seat-b',
      seatCol: 4,
      seatRow: 2,
      facingDir: Direction.UP,
      assigned: true,
    };
    os.seats.set('seat-a', seatA);
    os.seats.set('seat-b', seatB);

    os.addAgent(1, 0, 0);
    const ch1 = os.characters.get(1)!;
    ch1.seatId = 'seat-a';

    os.addAgent(2, 1, 0);
    const ch2 = os.characters.get(2)!;
    ch2.seatId = 'seat-b';

    os.reassignSeat(1, 'seat-b');

    assert.equal(ch1.seatId, 'seat-a');
    assert.equal(seatA.assigned, true);
    assert.equal(seatB.assigned, true);
  });

  it('reassignSeat atomically retains current seat when target seat does not exist', () => {
    const os = new OfficeState();
    os.seats.clear();
    const seatA: Seat = {
      uid: 'seat-a',
      seatCol: 2,
      seatRow: 2,
      facingDir: Direction.UP,
      assigned: true,
    };
    os.seats.set('seat-a', seatA);

    os.addAgent(1, 0, 0);
    const ch1 = os.characters.get(1)!;
    ch1.seatId = 'seat-a';

    os.reassignSeat(1, 'non-existent-seat');

    assert.equal(ch1.seatId, 'seat-a');
    assert.equal(seatA.assigned, true);
  });

  it('startAgentBreak honors explicitSpot without random reselection', () => {
    const os = new OfficeState();
    os.addAgent(1, 0, 0);
    const ch = os.characters.get(1)!;

    const explicitSpot: BreakSpot = {
      col: 22,
      row: 14,
      breakType: 'steamdeck',
      state: CharacterState.BREAK_STEAMDECK,
      dir: Direction.DOWN,
      isSitting: true,
    };

    os.startAgentBreak(1, 'steamdeck', explicitSpot);

    assert.equal(ch.isTakingBreak, true);
    assert.equal(ch.breakTargetCol, 22);
    assert.equal(ch.breakTargetRow, 14);
    assert.equal(ch.breakType, 'steamdeck');

    ch.tileCol = 22;
    ch.tileRow = 14;
    ch.path = [];

    os.startAgentBreak(1, 'steamdeck', explicitSpot);
    assert.equal(ch.tileCol, 22);
    assert.equal(ch.tileRow, 14);
  });

  it('returnAgentFromBreak transitions to THINK instead of TYPE when path to seat is blocked', () => {
    const os = new OfficeState();
    os.seats.clear();
    const deskSeat: Seat = {
      uid: 'desk-seat',
      seatCol: 5,
      seatRow: 5,
      facingDir: Direction.UP,
      assigned: true,
    };
    os.seats.set('desk-seat', deskSeat);

    os.addAgent(1, 0, 0);
    const ch = os.characters.get(1)!;
    ch.seatId = 'desk-seat';
    ch.tileCol = 20;
    ch.tileRow = 20;
    ch.isTakingBreak = true;

    for (let c = 0; c < os.layout.cols; c++) {
      for (let r = 0; r < os.layout.rows; r++) {
        os.blockedTiles.add(`${c},${r}`);
      }
    }

    os.returnAgentFromBreak(1);

    assert.notEqual(ch.state, CharacterState.TYPE);
    assert.equal(ch.state, CharacterState.IDLE);
  });

  it('restoreCopilotPixelAgents fallback spot includes isSitting true', () => {
    const os = new OfficeState();
    os.layout.furniture = [];
    os.walkableTiles = [];
    saveOrUpdateCopilotPixelAgent({
      id: -201,
      palette: 2,
      hueShift: 0,
      isSubagent: true,
      customName: 'Worker Fallback',
      role: 'Teammate',
      seatId: null,
      parentAgentId: 1,
      currentOrder: null,
      delegatedFrom: null,
      orderStatus: null,
    });

    os.restoreCopilotPixelAgents();
    const ch = os.characters.get(-201);
    assert.ok(ch);
    assert.equal(ch.isTakingBreak, true);
    assert.equal(ch.isSitting, true);
  });

  it('ensureSubagentTeam preserves independent worker characters when updating lead', () => {
    const os = new OfficeState();
    os.addAgent(1, 0, 0);
    const lead = os.characters.get(1)!;
    lead.isTeamLead = true;
    lead.role = 'Lead';

    os.addAgent(2, 1, 0);
    const terminalWorker = os.characters.get(2)!;
    terminalWorker.isTeamLead = false;
    terminalWorker.isSubagent = false;
    terminalWorker.role = 'Terminal';

    os.ensureSubagentTeam(1, 3);

    assert.ok(os.characters.has(2), 'Independent terminal worker character should be preserved');
  });

  it('isBreakRoomArea excludes assigned workstation desk seats', () => {
    const os = new OfficeState();
    os.seats.clear();
    const deskSeat: Seat = {
      uid: 'desk-seat-12-12',
      seatCol: 12,
      seatRow: 12,
      facingDir: Direction.UP,
      assigned: true,
    };
    os.seats.set('desk-seat-12-12', deskSeat);

    const isBreak = os.isBreakRoomArea(12, 12);
    assert.equal(isBreak, false);
  });
});
