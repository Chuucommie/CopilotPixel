/**
 * Tests for the `migrateLayoutColors` migration path (which wraps
 * the internal `migrateLayout` function — the only public migration entrypoint).
 *
 * Focused on the pet-system extension: legacy layouts (no `pets` field)
 * must be migrated to include `pets: []`. Layouts with existing `pets`
 * must preserve them unchanged.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import type { ColorValue } from '../src/components/ui/types.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { layoutToSeats, migrateLayoutColors } from '../src/office/layout/layoutSerializer.js';
import type { OfficeLayout, PlacedFurniture, PlacedPet } from '../src/office/types.js';
import { Direction } from '../src/office/types.js';
import { TileType } from '../src/office/types.js';

// ── Helpers ────────────────────────────────────────────────────

function baseLayout(overrides: Partial<OfficeLayout> = {}): OfficeLayout {
  // 4×3 minimum layout. layoutRevision = 1 to skip the OLD_VOID branch and
  // tileColors length-match to skip the tileColors-generation early return.
  const cols = 4;
  const rows = 3;
  const tiles = new Array(cols * rows).fill(TileType.FLOOR_1);
  const tileColors: Array<ColorValue | null> = new Array(cols * rows).fill(null);
  return {
    version: 1,
    cols,
    rows,
    tiles,
    furniture: [],
    tileColors,
    layoutRevision: 1,
    ...overrides,
  };
}

// ── Migration: pets field absent ──────────────────────────────

test('migrateLayoutColors injects pets:[] when missing on a fresh layout', () => {
  const layout = baseLayout();
  // Sanity precondition: no pets field on the input.
  assert.equal(layout.pets, undefined);
  const migrated = migrateLayoutColors(layout);
  assert.deepEqual(migrated.pets, []);
});

test('migrateLayoutColors injects pets:[] even when tileColors triggers the early-return path', () => {
  // tileColors already populated with the right length → early-return guard fires.
  // The pets-default block must run BEFORE that early return.
  const layout = baseLayout(); // already has matching tileColors
  const migrated = migrateLayoutColors(layout);
  assert.deepEqual(migrated.pets, []);
});

test('migrateLayoutColors handles pets: null (corrupted JSON) by defaulting to []', () => {
  const layout = baseLayout({ pets: null as unknown as PlacedPet[] | undefined });
  const migrated = migrateLayoutColors(layout);
  assert.deepEqual(migrated.pets, []);
});

// ── Migration: pets preserved ─────────────────────────────────

test('migrateLayoutColors preserves an existing non-empty pets array', () => {
  const pets: PlacedPet[] = [
    { id: 'pet-1', petType: 0 },
    { id: 'pet-2', petType: 1 },
  ];
  const layout = baseLayout({ pets });
  const migrated = migrateLayoutColors(layout);
  assert.deepEqual(migrated.pets, pets);
});

test('migrateLayoutColors preserves an empty pets array (does not overwrite)', () => {
  const layout = baseLayout({ pets: [] });
  const migrated = migrateLayoutColors(layout);
  assert.deepEqual(migrated.pets, []);
});

// ── Migration: pets + tileColors regeneration interaction ─────

test('migrateLayoutColors injects pets:[] AND regenerates tileColors when missing', () => {
  // Force the tileColors path by stripping tileColors entirely.
  const layout: OfficeLayout = {
    version: 1,
    cols: 4,
    rows: 3,
    tiles: new Array(12).fill(TileType.FLOOR_1),
    furniture: [],
    layoutRevision: 1,
  };
  const migrated = migrateLayoutColors(layout);
  assert.deepEqual(migrated.pets, []);
  assert.ok(Array.isArray(migrated.tileColors));
  assert.equal(migrated.tileColors!.length, 12);
});

// ── Migration: OLD_VOID + pets interaction ────────────────────

test('migrateLayoutColors handles OLD_VOID tile migration AND pets:[] injection together', () => {
  // Mark as legacy: no layoutRevision, contains OLD_VOID=8.
  const cols = 4;
  const rows = 3;
  const tiles: number[] = new Array(cols * rows).fill(TileType.FLOOR_1);
  tiles[0] = 8; // OLD_VOID literal
  const layout: OfficeLayout = {
    version: 1,
    cols,
    rows,
    tiles: tiles as OfficeLayout['tiles'],
    furniture: [],
  };
  const migrated = migrateLayoutColors(layout);
  assert.equal(migrated.tiles[0], TileType.VOID);
  assert.deepEqual(migrated.pets, []);
});

// ── Migration: returned layout retains other fields ───────────

test('migrateLayoutColors preserves furniture and other fields untouched', () => {
  const furniture: PlacedFurniture[] = [{ uid: 'f-1', type: 'desk_basic', col: 1, row: 1 }];
  const layout = baseLayout({ furniture, pets: [{ id: 'p1', petType: 0 }] });
  const migrated = migrateLayoutColors(layout);
  assert.equal(migrated.furniture.length, 1);
  // The migrator may rewrite furniture types, so compare uid/col/row, not the
  // raw type string.
  assert.equal(migrated.furniture[0].uid, 'f-1');
  assert.equal(migrated.furniture[0].col, 1);
  assert.equal(migrated.furniture[0].row, 1);
  assert.deepEqual(migrated.pets, [{ id: 'p1', petType: 0 }]);
  assert.equal(migrated.cols, 4);
  assert.equal(migrated.rows, 3);
  assert.equal(migrated.version, 1);
});

// ── Migration: idempotency ────────────────────────────────────

test('migrateLayoutColors is idempotent (running twice produces equivalent output)', () => {
  const layout = baseLayout();
  const once = migrateLayoutColors(layout);
  const twice = migrateLayoutColors(once);
  assert.deepEqual(twice.pets, once.pets);
  assert.deepEqual(twice.tiles, once.tiles);
  assert.deepEqual(twice.tileColors, once.tileColors);
});

// ── Chair facing direction in layoutToSeats ─────────────────

test('layoutToSeats assigns correct facing direction to chairs (including mirrored :left chairs)', () => {
  // Mock minimal dynamic catalog with chairs
  buildDynamicCatalog({
    catalog: [
      {
        id: 'WOODEN_CHAIR_SIDE',
        label: 'Wooden Chair Side',
        category: 'chairs',
        width: 16,
        height: 32,
        footprintW: 1,
        footprintH: 2,
        isDesk: false,
        orientation: 'side',
        mirrorSide: true,
        backgroundTiles: 1,
      },
      {
        id: 'SOFA_FRONT',
        label: 'Sofa Front',
        category: 'chairs',
        width: 32,
        height: 16,
        footprintW: 2,
        footprintH: 1,
        isDesk: false,
        orientation: 'front',
      },
      {
        id: 'SOFA_BACK',
        label: 'Sofa Back',
        category: 'chairs',
        width: 32,
        height: 16,
        footprintW: 2,
        footprintH: 1,
        isDesk: false,
        orientation: 'back',
      },
      {
        id: 'SOFA_SIDE',
        label: 'Sofa Side',
        category: 'chairs',
        width: 16,
        height: 32,
        footprintW: 1,
        footprintH: 2,
        isDesk: false,
        orientation: 'side',
        mirrorSide: true,
      },
      {
        id: 'CUSHIONED_CHAIR_BACK',
        label: 'Cushioned Chair Back',
        category: 'chairs',
        width: 16,
        height: 16,
        footprintW: 1,
        footprintH: 1,
        isDesk: false,
        orientation: 'back',
      },
    ],
    sprites: {
      WOODEN_CHAIR_SIDE: [['#fff']],
      SOFA_FRONT: [['#fff']],
      SOFA_BACK: [['#fff']],
      SOFA_SIDE: [['#fff']],
      CUSHIONED_CHAIR_BACK: [['#fff']],
    },
  });

  const furniture: PlacedFurniture[] = [
    { uid: 'chair-right', type: 'WOODEN_CHAIR_SIDE', col: 3, row: 16 },
    { uid: 'chair-left', type: 'WOODEN_CHAIR_SIDE:left', col: 7, row: 16 },
    { uid: 'sofa-f', type: 'SOFA_FRONT', col: 16, row: 14 },
    { uid: 'sofa-b', type: 'SOFA_BACK', col: 16, row: 17 },
    { uid: 'sofa-s-right', type: 'SOFA_SIDE', col: 14, row: 15 },
    { uid: 'sofa-s-left', type: 'SOFA_SIDE:left', col: 19, row: 15 },
    { uid: 'cchair-b', type: 'CUSHIONED_CHAIR_BACK', col: 23, row: 17 },
  ];

  const seats = layoutToSeats(furniture);

  // WOODEN_CHAIR_SIDE should face RIGHT (toward table on right)
  const seatRight = seats.get('chair-right');
  assert.ok(seatRight, 'chair-right seat should exist');
  assert.equal(seatRight.seatCol, 3);
  assert.equal(seatRight.seatRow, 17); // row + backgroundTiles (1)
  assert.equal(seatRight.facingDir, Direction.RIGHT, 'WOODEN_CHAIR_SIDE must face RIGHT');

  // WOODEN_CHAIR_SIDE:left should face LEFT (toward table on left) - regression test!
  const seatLeft = seats.get('chair-left');
  assert.ok(seatLeft, 'chair-left seat should exist');
  assert.equal(seatLeft.seatCol, 7);
  assert.equal(seatLeft.seatRow, 17); // row + backgroundTiles (1)
  assert.equal(
    seatLeft.facingDir,
    Direction.LEFT,
    'WOODEN_CHAIR_SIDE:left must face LEFT, not inverted to RIGHT',
  );

  // SOFA_FRONT should face DOWN (toward coffee table)
  const sofaF = seats.get('sofa-f');
  assert.ok(sofaF);
  assert.equal(sofaF.facingDir, Direction.DOWN);

  // SOFA_BACK should face UP (toward coffee table)
  const sofaB = seats.get('sofa-b');
  assert.ok(sofaB);
  assert.equal(sofaB.facingDir, Direction.UP);

  // SOFA_SIDE:left should face LEFT (toward coffee table) - regression test!
  const sofaSLeft = seats.get('sofa-s-left');
  assert.ok(sofaSLeft);
  assert.equal(sofaSLeft.seatRow, 16); // row + 1 (cushion)
  assert.equal(sofaSLeft.facingDir, Direction.LEFT, 'SOFA_SIDE:left must face LEFT');

  // CUSHIONED_CHAIR_BACK should face UP (toward dining table)
  const cchairB = seats.get('cchair-b');
  assert.ok(cchairB);
  assert.equal(cchairB.seatCol, 23);
  assert.equal(cchairB.seatRow, 17);
  assert.equal(cchairB.facingDir, Direction.UP);
});
