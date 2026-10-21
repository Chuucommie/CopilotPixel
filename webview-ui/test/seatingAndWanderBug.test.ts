import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, it } from 'vitest';

import { buildFurnitureCatalog } from '../../core/src/assets/build.js';
import { clearCopilotPixelAgentsStore } from '../src/office/engine/copilotPixelStore.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import type { LoadedAssetData } from '../src/office/layout/furnitureCatalog.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { OFFICE_PRESETS } from '../src/office/layout/layoutPresets.js';
import { CharacterState } from '../src/office/types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets');

describe('Seating Posture and Wander ("Farsi un giro") Regression Suite', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
      clearCopilotPixelAgentsStore();
    }
    const rawCatalog = buildFurnitureCatalog(root);
    const sprites: Record<string, string[][]> = {};
    for (const item of rawCatalog) sprites[item.id] = [['#fff']];
    const assetData: LoadedAssetData = {
      catalog: rawCatalog.map((item) => ({
        id: item.id,
        label: item.label,
        category: item.category,
        width: item.width,
        height: item.height,
        footprintW: item.footprintW,
        footprintH: item.footprintH,
        isDesk: item.isDesk,
        orientation: item.orientation,
        backgroundTiles: item.backgroundTiles,
        canPlaceOnSurfaces: item.canPlaceOnSurfaces,
        canPlaceOnWalls: item.canPlaceOnWalls,
      })),
      sprites,
    };
    buildDynamicCatalog(assetData);
  });

  it('guarantees that characters stationary on any chair or sofa are sitting down (isSitting === true)', () => {
    const os = new OfficeState(OFFICE_PRESETS[0].layout);
    os.addAgent(1, 0, 0); // lead
    os.ensureSubagentTeam(1, 6); // lead + 5 workers

    // Tick for 2 seconds to let initial state settle
    for (let f = 0; f < 120; f++) {
      os.update(1 / 60);
    }

    for (const ch of os.characters.values()) {
      const seat = os.getSeatAtTile(ch.tileCol, ch.tileRow);
      if (seat && ch.path.length === 0 && ch.state !== CharacterState.WALK) {
        assert.equal(
          ch.isSitting,
          true,
          `Character ${ch.customName || String(ch.id)} is at seat tile (${String(ch.tileCol)},${String(ch.tileRow)}) but isSitting is false (standing on chair!)`,
        );
      }
    }
  });

  it('prevents Team Lead from flip-flopping into TYPE and keeps Lead sitting while stationary at seat', () => {
    const os = new OfficeState(OFFICE_PRESETS[0].layout);
    os.addAgent(1, 0, 0);
    const lead = os.characters.get(1)!;
    assert.ok(lead.isTeamLead);
    lead.wanderTimer = 10; // keep lead seated for 10 seconds

    // Run 30 consecutive frames and verify lead never enters TYPE and stays sitting at their chair
    for (let f = 0; f < 30; f++) {
      os.update(1 / 60);
      assert.notEqual(
        lead.state,
        CharacterState.TYPE,
        'Team Lead should not flip to TYPE while at seat',
      );
      assert.equal(lead.state, CharacterState.IDLE, 'Team Lead should remain in IDLE while seated');
      assert.equal(lead.isSitting, true, 'Team Lead at seat should remain sitting');
    }
  });

  it('allows Team Lead to get up, patrol, and take a stroll without rushing back immediately', () => {
    const os = new OfficeState(OFFICE_PRESETS[0].layout);
    os.addAgent(1, 0, 0);
    os.ensureSubagentTeam(1, 6);
    const lead = os.characters.get(1)!;

    // Trigger mentoring patrol
    os.leadMentoringTimer = 7.0;
    os.update(1 / 60);

    assert.equal(lead.state, CharacterState.WALK, 'Lead should start walking to mentor/patrol');
    assert.equal(lead.isSitting, false, 'Lead should not be sitting while walking');
    assert.ok(lead.path.length > 0, 'Lead path should be populated');

    // Run for 3 frames and ensure lead continues walking rather than aborting to rush back to seat
    os.update(1 / 60);
    os.update(1 / 60);
    os.update(1 / 60);
    assert.equal(
      lead.state,
      CharacterState.WALK,
      'Lead should continue walking along the patrol path',
    );
  });

  it('allows break room workers to wander and take strolls ("farsi un giro") across the lounge floor', () => {
    const os = new OfficeState(OFFICE_PRESETS[0].layout);
    os.addAgent(1, 0, 0);
    os.ensureSubagentTeam(1, 6);

    const initialPositions = new Map<number, string>();
    for (const [id, ch] of os.characters.entries()) {
      if (!ch.isTeamLead) {
        initialPositions.set(id, `${String(ch.tileCol)},${String(ch.tileRow)}`);
      }
    }

    // Simulate 35 seconds of break room activity
    let movedCount = 0;
    for (let sec = 0; sec < 35; sec++) {
      for (let f = 0; f < 60; f++) {
        os.update(1 / 60);
      }
      for (const [id, ch] of os.characters.entries()) {
        if (!ch.isTeamLead) {
          const initPos = initialPositions.get(id);
          if (initPos && initPos !== `${String(ch.tileCol)},${String(ch.tileRow)}`) {
            movedCount++;
            break;
          }
        }
      }
      if (movedCount > 0) break;
    }

    assert.ok(
      movedCount > 0,
      'At least one break worker should get up and take a stroll or switch spots',
    );
  });

  it('verifies seated agents can pathfind out of their chair to wander without start-tile blockage', () => {
    const os = new OfficeState(OFFICE_PRESETS[0].layout);
    os.addAgent(1, 0, 0);
    const lead = os.characters.get(1)!;

    // Chair tile where lead is seated is in blockedTiles
    const chairTile = `${String(lead.tileCol)},${String(lead.tileRow)}`;
    assert.ok(os.blockedTiles.has(chairTile), 'Chair tile should normally be in blockedTiles');

    // When wandering begins, an open destination is reachable from the chair
    lead.wanderTimer = 0;
    os.update(1 / 60);

    assert.equal(lead.state, CharacterState.WALK, 'Lead successfully pathfound out of chair');
    assert.ok(lead.path.length > 0, 'Path was found from chair tile');
  });
});
