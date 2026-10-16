import { describe, expect, it } from 'vitest';

import {
  ENGLISH_NAMES_50,
  getAgentProfile,
  getAllRoles,
  getRandomEnglishName,
  getRoleDefinition,
  updateAgentProfile,
} from '../src/office/agentRoles.js';

describe('agentRoles and names', () => {
  it('contains exactly 50 distinct English names', () => {
    expect(ENGLISH_NAMES_50.length).toBe(50);
    const unique = new Set(ENGLISH_NAMES_50);
    expect(unique.size).toBe(50);
  });

  it('selects a random name and excludes used names if possible', () => {
    const used = ['Alex', 'Jordan', 'Taylor'];
    const chosen = getRandomEnglishName(used);
    expect(ENGLISH_NAMES_50).toContain(chosen);
    expect(used.map((u) => u.toLowerCase())).not.toContain(chosen.toLowerCase());
  });

  it('contains all required 8 team roles', () => {
    const roles = getAllRoles();
    expect(roles.length).toBe(8);
    const roleIds = roles.map((r) => r.id);
    expect(roleIds).toContain('Lead');
    expect(roleIds).toContain('Architect');
    expect(roleIds).toContain('Coder');
    expect(roleIds).toContain('Researcher');
    expect(roleIds).toContain('Reviewer');
    expect(roleIds).toContain('Tester');
    expect(roleIds).toContain('DevOps');
    expect(roleIds).toContain('Generalist');
  });

  it('retrieves role definitions with valid badges and icons', () => {
    const lead = getRoleDefinition('Lead');
    expect(lead.id).toBe('Lead');
    expect(lead.badgeColor).toBeTruthy();
    expect(lead.icon).toBeTruthy();
    expect(lead.canDelegate).toBe(true);

    const coder = getRoleDefinition('Coder');
    expect(coder.id).toBe('Coder');
    expect(coder.canDelegate).toBe(false);

    const fallback = getRoleDefinition('NonExistentRole');
    expect(fallback.id).toBe('Generalist');
  });

  it('manages agent profiles with customName, role, and directives', () => {
    const profile = getAgentProfile(99, [], true);
    expect(profile.customName).toBeTruthy();
    expect(profile.role).toBe('Lead');

    const updated = updateAgentProfile(99, {
      customName: 'CustomAlex',
      role: 'Architect',
      currentOrder: 'Design new layout',
    });
    expect(updated.customName).toBe('CustomAlex');
    expect(updated.role).toBe('Architect');
    expect(updated.currentOrder).toBe('Design new layout');
    expect(updated.orderHistory).toContain('Design new layout');
  });
});
