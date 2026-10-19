import assert from 'node:assert/strict';

import { beforeEach, describe, it } from 'vitest';

import {
  BREAK_ROOM_CONVERSATIONS,
  BREAK_ROOM_SOLO_THOUGHTS,
  inferWorkerRole,
} from '../src/office/engine/breakRoomChatter.js';
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
  it('records and persists inter-agent team dialogue', () => {
    const os = new OfficeState();
    os.addAgent(1, 0, 0);
    const subId = os.spawnSubagentWithRole(1, 'Coder', 'Marcus');

    const msg = os.addTeamDialogue({
      fromAgentId: 1,
      fromName: 'Lead Alex',
      fromRole: 'Lead',
      toAgentId: subId,
      toName: 'Marcus',
      toRole: 'Coder',
      text: 'Marcus, please inspect the test suite.',
      context: 'delegation',
    });

    assert.ok(msg.id);
    assert.equal(os.teamDialogue.length, 1);
    assert.equal(os.teamDialogue[0].text, 'Marcus, please inspect the test suite.');

    // Speech bubble set on sender character
    const leadCh = os.characters.get(1)!;
    assert.ok(leadCh.speechBubbleText);
    assert.ok(leadCh.speechBubbleTimer! > 0);
  });

  it('tracks break duration and auto-wakes agent when active tool starts', () => {
    const os = new OfficeState();
    os.addAgent(1, 0, 0, undefined, true);
    const ch = os.characters.get(1)!;

    os.startAgentBreak(1, 'coffee');
    assert.equal(ch.isTakingBreak, true);
    assert.ok(ch.breakStartTime);

    // Update with dt
    os.update(1.5);
    assert.ok((ch.breakDuration || 0) >= 1.5);

    // When tool starts, agent auto-wakes from break to work
    os.setAgentTool(1, 'readFile');
    assert.equal(ch.isTakingBreak, false);
    assert.equal(ch.breakType, null);
  });

  it('ensures a 5-subagent team in the break room and reuses them on addSubagent', () => {
    const os = new OfficeState();
    os.addAgent(1, 0, 0, undefined, true);
    const subIds = os.ensureSubagentTeam(1, 5);

    assert.equal(subIds.length, 5);
    // All 5 subagents should exist and be on break in the break room
    for (const sId of subIds) {
      const sub = os.characters.get(sId);
      assert.ok(sub, `Subagent ${sId} should exist`);
      assert.equal(sub.isSubagent, true);
      assert.equal(sub.isTakingBreak, true);
      assert.ok(sub.breakType);
    }

    // Calling addSubagent should wake up one of the subagents on break rather than creating an extra one
    const activeSubId = os.addSubagent(1, 'tool-task-research');
    assert.ok(subIds.includes(activeSubId), 'Should reuse one of the break room subagents');
    const activeSub = os.characters.get(activeSubId)!;
    assert.equal(activeSub.isTakingBreak, false);
    assert.ok(activeSub.state === CharacterState.WALK || activeSub.state === CharacterState.TYPE);
  });

  it('guarantees at least 6 agents total (1 leader + 5 workers)', () => {
    const os = new OfficeState();
    os.addAgent(1, 0, 0, undefined, true);
    const lead = os.characters.get(1)!;
    lead.isTeamLead = true;

    const workerIds = os.ensureSubagentTeam(1, 5);
    assert.ok(workerIds.length >= 5, `Must have at least 5 workers, got ${workerIds.length}`);
    assert.equal(os.characters.size, 1 + workerIds.length);
    assert.ok(
      os.characters.size >= 6,
      `Total agents in office must be at least 6, got ${os.characters.size}`,
    );
  });

  it('infers dynamic worker roles based on tool action and status', () => {
    assert.equal(inferWorkerRole('search_web', 'Searching documentation'), 'Researcher');
    assert.equal(inferWorkerRole('read_url_content', 'Fetching API specs'), 'Researcher');
    assert.equal(
      inferWorkerRole('write_to_file', 'Writing parser implementation'),
      'Software Engineer',
    );
    assert.equal(
      inferWorkerRole('replace_file_content', 'Refactoring helper logic'),
      'Software Engineer',
    );
    assert.equal(
      inferWorkerRole(null, 'Drafting system architecture diagram and schema'),
      'Software Architect',
    );
    assert.equal(
      inferWorkerRole(null, 'Updating index.css and pixel art theme layout'),
      'Designer',
    );
    assert.equal(inferWorkerRole('run_command', 'Running vitest test suite'), 'Test Engineer');
    assert.equal(
      inferWorkerRole('run_command', 'Packaging VSIX bundle with vsce'),
      'DevOps Engineer',
    );
    assert.equal(
      inferWorkerRole(null, 'Running eslint and gitleaks security audit'),
      'Code Reviewer',
    );
  });

  it('provides extensive break room conversation lines (at least 50 dialogue pairs)', () => {
    assert.ok(
      BREAK_ROOM_CONVERSATIONS.length >= 50,
      `Expected at least 50 conversations, got ${BREAK_ROOM_CONVERSATIONS.length}`,
    );
    assert.ok(
      BREAK_ROOM_SOLO_THOUGHTS.length >= 10,
      `Expected at least 10 solo thoughts, got ${BREAK_ROOM_SOLO_THOUGHTS.length}`,
    );
    // Each dialogue pair must have non-empty a and b
    for (const pair of BREAK_ROOM_CONVERSATIONS) {
      assert.ok(pair.a.length > 5);
      assert.ok(pair.b.length > 5);
    }
  });

  it('dynamically switches worker role to Researcher on assignment and resets to Teammate on break', () => {
    const os = new OfficeState();
    os.addAgent(1, 0, 0, undefined, true);
    const workerIds = os.ensureSubagentTeam(1, 5);

    // Initial state: resting in break room as Teammate
    const firstWorker = os.characters.get(workerIds[0])!;
    assert.equal(firstWorker.role, 'Teammate');
    assert.equal(firstWorker.isTakingBreak, true);

    // Leader calls worker for web research
    const assignedId = os.addSubagent(
      1,
      'tool-search-1',
      'search_web',
      'Searching latest AI papers',
    );
    const activeWorker = os.characters.get(assignedId)!;
    assert.equal(activeWorker.role, 'Researcher');
    assert.equal(activeWorker.isTakingBreak, false);

    // Worker returns to break
    os.startAgentBreak(assignedId, 'coffee');
    activeWorker.role = 'Teammate';
    assert.equal(activeWorker.isTakingBreak, true);
    assert.equal(activeWorker.breakType, 'coffee');
  });

  it('enforces strictly ONE Project Lead per team and office', () => {
    const os = new OfficeState();
    // Agent 1 is initially created as Lead
    os.addAgent(1, 0, 0, undefined, true);
    const workerIds = os.ensureSubagentTeam(1, 5);
    assert.equal(workerIds.length, 5);

    const lead1 = os.characters.get(1)!;
    assert.equal(lead1.isTeamLead, true);
    assert.equal(lead1.role, 'Lead');

    // A second chat agent 2 is added and promoted to Lead
    os.addAgent(2, 1, 0, undefined, true);
    os.setAgentRole(2, 'Lead');

    const lead2 = os.characters.get(2)!;
    assert.equal(lead2.isTeamLead, true);
    assert.equal(lead2.role, 'Lead');

    // Agent 1 MUST be demoted: never two leads
    assert.equal(lead1.isTeamLead, false);
    assert.equal(lead1.role, 'Teammate');

    // Count leads across all characters in office
    const leads = Array.from(os.characters.values()).filter(
      (c) => c.isTeamLead || c.role === 'Lead',
    );
    assert.equal(leads.length, 1, 'There must be strictly ONE Project Lead in office');
    assert.equal(leads[0].id, 2);
  });

  it('sanitizes subagents so they never retain or display Lead role', () => {
    const os = new OfficeState();
    os.addAgent(1, 0, 0, undefined, true);
    const workerIds = os.ensureSubagentTeam(1, 5);

    const sub = os.characters.get(workerIds[0])!;
    // Simulate legacy rogue state where subagent had role = 'Lead'
    sub.role = 'Lead';
    sub.isTeamLead = true;

    os.sanitizeTeamHierarchy();

    assert.equal(sub.isTeamLead, false);
    assert.equal(sub.role, 'Teammate');

    // Lead remains strictly agent 1
    const lead = os.characters.get(1)!;
    assert.equal(lead.isTeamLead, true);
    assert.equal(lead.role, 'Lead');
  });

  it('preserves isTeamLead in setTeamInfo when isTeamLead is omitted', () => {
    const os = new OfficeState();
    os.addAgent(2, 0, 0, undefined, true);
    const ch = os.characters.get(2)!;
    ch.isTeamLead = true;
    ch.role = 'Lead';

    // Calling setTeamInfo without isTeamLead (e.g. Antigravity turn start)
    os.setTeamInfo(2, 'Antigravity', 'Gemini', undefined);

    assert.equal(ch.isTeamLead, true, 'isTeamLead must not be cleared by undefined parameter');
    assert.equal(ch.role, 'Lead');
  });

  it('subdivides sequential and concurrent tools across random team workers with appropriate roles', () => {
    const os = new OfficeState();
    os.addAgent(1, 0, 0, undefined, true);
    const workerIds = os.ensureSubagentTeam(1, 5);

    // Initial state: all 5 workers are on break in the break room
    for (const wId of workerIds) {
      const w = os.characters.get(wId)!;
      assert.equal(w.isTakingBreak, true);
      assert.equal(w.role, 'Teammate');
    }

    // 1. First tool: web research
    const subId1 = os.addSubagent(1, 'tool-1', 'search_web', 'Searching API documentation');
    const worker1 = os.characters.get(subId1)!;
    assert.ok(workerIds.includes(subId1));
    assert.equal(worker1.isTakingBreak, false);
    assert.equal(worker1.role, 'Researcher');
    assert.equal(worker1.state, CharacterState.TYPE);

    // 2. Second concurrent tool: code editing
    const subId2 = os.addSubagent(
      1,
      'tool-2',
      'replace_file_content',
      'Updating controller implementation',
    );
    const worker2 = os.characters.get(subId2)!;
    assert.ok(workerIds.includes(subId2));
    assert.notEqual(subId1, subId2, 'Tasks should be subdivided across different workers');
    assert.equal(worker2.isTakingBreak, false);
    assert.equal(worker2.role, 'Software Engineer');
    assert.equal(worker2.state, CharacterState.TYPE);

    // 3. Third concurrent tool: test suite execution
    const subId3 = os.addSubagent(1, 'tool-3', 'run_command', 'Running vitest unit test suite');
    const worker3 = os.characters.get(subId3)!;
    assert.ok(workerIds.includes(subId3));
    assert.notEqual(subId3, subId1);
    assert.notEqual(subId3, subId2);
    assert.equal(worker3.isTakingBreak, false);
    assert.equal(worker3.role, 'Test Engineer');
    assert.equal(worker3.state, CharacterState.TYPE);

    // When turn completes and workers finish, they safely return to the Break Room as Teammates
    os.removeSubagent(1, 'tool-1');
    os.removeSubagent(1, 'tool-2');
    os.removeSubagent(1, 'tool-3');
    os.returnAllTeamWorkersToBreak(1);

    for (const wId of [subId1, subId2, subId3]) {
      const w = os.characters.get(wId)!;
      assert.equal(w.isTakingBreak, true);
      assert.equal(w.role, 'Teammate');
    }
  });

  it('engages random workers in team reasoning during active chat reasoning phase', () => {
    const os = new OfficeState();
    os.addAgent(1, 0, 0, undefined, true);
    const workerIds = os.ensureSubagentTeam(1, 5);

    // Start team reasoning (e.g. LLM planning / thinking block)
    const engaged = os.startTeamReasoning(1);
    assert.ok(
      engaged.length >= 1 && engaged.length <= 2,
      'Should engage 1-2 workers for reasoning',
    );

    for (const wId of engaged) {
      assert.ok(workerIds.includes(wId));
      const w = os.characters.get(wId)!;
      assert.equal(w.isTakingBreak, false);
      assert.ok(
        w.role === 'Software Architect' || w.role === 'Researcher' || w.role === 'Code Reviewer',
        `Expected reasoning role, got ${w.role}`,
      );
      assert.equal(w.state, CharacterState.TYPE);
    }

    // Turn concludes: all workers return to the Break Room
    os.returnAllTeamWorkersToBreak(1);

    for (const wId of engaged) {
      const w = os.characters.get(wId)!;
      assert.equal(w.isTakingBreak, true);
      assert.equal(w.role, 'Teammate');
    }
  });
});
