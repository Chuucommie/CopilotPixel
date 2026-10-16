import assert from 'node:assert/strict';

import { beforeEach, describe, it } from 'vitest';

import {
  clearCopilotPixelAgentsStore,
  loadCopilotPixelAgents,
  removeCopilotPixelAgent,
  saveOrUpdateCopilotPixelAgent,
} from '../src/office/engine/copilotPixelStore.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { CharacterState } from '../src/office/types.js';

describe('CopilotPixel Autonomous & Persistent Agents', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
      clearCopilotPixelAgentsStore();
    }
  });

  it('persists and retrieves CopilotPixel agents in store', () => {
    saveOrUpdateCopilotPixelAgent({
      id: -101,
      customName: 'Alex Lead',
      role: 'Project Lead',
      palette: 3,
      hueShift: 90,
      seatId: 'seat_1',
      isSubagent: false,
      parentAgentId: null,
      currentOrder: 'Coordinate system build',
      delegatedFrom: null,
      orderStatus: 'running',
    });

    const loaded = loadCopilotPixelAgents();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].customName, 'Alex Lead');
    assert.equal(loaded[0].role, 'Project Lead');

    removeCopilotPixelAgent(-101);
    assert.equal(loadCopilotPixelAgents().length, 0);
  });

  it('diversifies subagent palette and marks as CopilotPixelAgent', () => {
    const os = new OfficeState();
    os.addAgent(1, 0, 0); // Parent with palette 0
    const parent = os.characters.get(1)!;
    assert.equal(parent.palette, 0);

    const subId = os.spawnSubagentWithRole(1, 'Coder', 'Bob Subagent', 'Write parser');
    const subCh = os.characters.get(subId);
    assert.ok(subCh, 'Subagent character should exist');
    assert.equal(subCh.customName, 'Bob Subagent');
    assert.equal(subCh.role, 'Coder');
    assert.equal(subCh.isCopilotPixelAgent, true);
    // Subagent palette must NOT be identical to parent's palette 0
    assert.notEqual(subCh.palette, parent.palette);
  });

  it('handles break routines and resuming work', () => {
    const os = new OfficeState();
    os.addAgent(1, 0, 0);
    const subId = os.spawnSubagentWithRole(1, 'Tester', 'Diana Test');
    const subCh = os.characters.get(subId)!;

    // Start coffee break
    os.startAgentBreak(subId, 'coffee');
    assert.equal(subCh.isTakingBreak, true);
    assert.equal(subCh.breakType, 'coffee');

    // Resuming work exits break
    os.returnAgentFromBreak(subId);
    assert.equal(subCh.isTakingBreak, false);
    assert.equal(subCh.breakType, null);

    // Start Steam Deck break
    os.startAgentBreak(subId, 'steamdeck');
    assert.equal(subCh.isTakingBreak, true);
    assert.equal(subCh.breakType, 'steamdeck');

    // Setting a new order automatically calls agent back from break
    os.setAgentOrder(subId, 'Fix critical regression');
    assert.equal(subCh.isTakingBreak, false);
    assert.equal(subCh.currentOrder, 'Fix critical regression');
  });

  it('preserves persistent CopilotPixel agents on removeAllSubagents', () => {
    const os = new OfficeState();
    os.addAgent(1, 0, 0);
    const subId = os.spawnSubagentWithRole(1, 'Architect', 'Elena');
    assert.ok(os.characters.has(subId));

    // When chat ends and calls removeAllSubagents(1), persistent CopilotPixel agents are spared
    os.removeAllSubagents(1);
    assert.ok(os.characters.has(subId), 'Persistent agent should not be removed');
  });

  it('restores CopilotPixel agents from persistent store', () => {
    saveOrUpdateCopilotPixelAgent({
      id: -555,
      customName: 'Persistent Zoe',
      role: 'Reviewer',
      palette: 2,
      hueShift: 180,
      seatId: null,
      isSubagent: true,
      parentAgentId: 1,
      currentOrder: 'Review PR',
      delegatedFrom: 'Lead',
      orderStatus: 'completed',
      isTakingBreak: true,
      breakType: 'steamdeck',
    });

    const os = new OfficeState();
    const restoredIds = os.restoreCopilotPixelAgents();
    assert.ok(restoredIds.includes(-555));

    const restoredCh = os.characters.get(-555);
    assert.ok(restoredCh);
    assert.equal(restoredCh.customName, 'Persistent Zoe');
    assert.equal(restoredCh.isTakingBreak, true);
    assert.equal(restoredCh.breakType, 'steamdeck');
    assert.equal(restoredCh.state, CharacterState.BREAK_STEAMDECK);
  });
});
