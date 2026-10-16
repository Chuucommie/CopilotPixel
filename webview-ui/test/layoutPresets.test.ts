import { describe, expect, it } from 'vitest';

import { getLayoutPresets, getPresetById } from '../src/office/layout/layoutPresets.js';

describe('layoutPresets', () => {
  it('loads all 7 office presets (1 default, 2 normal, 2 medium, 2 large)', () => {
    const presets = getLayoutPresets();
    expect(presets.length).toBe(7);

    const categories = presets.map((p) => p.category);
    expect(categories.filter((c) => c === 'default').length).toBe(1);
    expect(categories.filter((c) => c === 'normal').length).toBe(2);
    expect(categories.filter((c) => c === 'medium').length).toBe(2);
    expect(categories.filter((c) => c === 'large').length).toBe(2);
  });

  it('validates grid dimensions and tile arrays for every preset', () => {
    const presets = getLayoutPresets();
    for (const preset of presets) {
      const { cols, rows, tiles, tileColors, furniture } = preset.layout;
      expect(cols).toBeGreaterThan(0);
      expect(rows).toBeGreaterThan(0);
      expect(tiles.length).toBe(cols * rows);
      if (tileColors) {
        expect(tileColors.length).toBe(cols * rows);
      }
      expect(Array.isArray(furniture)).toBe(true);
      expect(furniture.length).toBeGreaterThan(0);
    }
  });

  it('retrieves preset by ID correctly', () => {
    const startup = getPresetById('normal-startup');
    expect(startup).toBeDefined();
    expect(startup?.name).toBe('Cozy Startup');
    expect(startup?.category).toBe('normal');

    const campus = getPresetById('large-campus');
    expect(campus).toBeDefined();
    expect(campus?.name).toBe('Corporate Campus');
    expect(campus?.category).toBe('large');
  });

  it('contains workstations with desks and chairs in every preset', () => {
    const presets = getLayoutPresets();
    for (const preset of presets) {
      const types = preset.layout.furniture.map((f) => f.type);
      const hasDesk = types.some((t) => t.includes('DESK') || t.includes('TABLE'));
      const hasChair = types.some(
        (t) => t.includes('CHAIR') || t.includes('BENCH') || t.includes('SOFA'),
      );
      expect(hasDesk).toBe(true);
      expect(hasChair).toBe(true);
    }
  });
});
