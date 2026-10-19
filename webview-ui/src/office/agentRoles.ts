import {
  ROLE_BADGE_ARCHITECT_COLOR,
  ROLE_BADGE_CODER_COLOR,
  ROLE_BADGE_DESIGNER_COLOR,
  ROLE_BADGE_DEVOPS_COLOR,
  ROLE_BADGE_GENERALIST_COLOR,
  ROLE_BADGE_LEAD_COLOR,
  ROLE_BADGE_RESEARCHER_COLOR,
  ROLE_BADGE_REVIEWER_COLOR,
  ROLE_BADGE_TEAMMATE_COLOR,
  ROLE_BADGE_TESTER_COLOR,
} from '../constants.js';
export const ENGLISH_NAMES_50: readonly string[] = [
  'Alex',
  'Jordan',
  'Taylor',
  'Morgan',
  'Riley',
  'Casey',
  'Avery',
  'Logan',
  'Sam',
  'Jamie',
  'Charlie',
  'Dakota',
  'Reese',
  'Quinn',
  'Rowan',
  'Harper',
  'Ellis',
  'Skyler',
  'Hayden',
  'Cameron',
  'Adrian',
  'Blake',
  'Robin',
  'Jesse',
  'Sidney',
  'Kendall',
  'Peyton',
  'Drew',
  'Sawyer',
  'Finley',
  'Brooke',
  'Parker',
  'Dallas',
  'Devon',
  'Eden',
  'Francis',
  'Glen',
  'Harley',
  'Jules',
  'Kieran',
  'Lane',
  'Leslie',
  'Loren',
  'Micah',
  'Noel',
  'Perry',
  'Rene',
  'Rory',
  'Shannon',
  'Val',
] as const;

export interface AgentRoleDefinition {
  id: string;
  name: string;
  icon: string;
  badgeColor: string;
  description: string;
  canDelegate: boolean;
}

export const AGENT_ROLES: readonly AgentRoleDefinition[] = [
  {
    id: 'Lead',
    name: 'Project Lead',
    icon: '👑',
    badgeColor: ROLE_BADGE_LEAD_COLOR,
    description: 'Coordinates tasks, oversees team roadmap, and delegates work.',
    canDelegate: true,
  },
  {
    id: 'Architect',
    name: 'Software Architect',
    icon: '📐',
    badgeColor: ROLE_BADGE_ARCHITECT_COLOR,
    description: 'Designs system architectures, schemas, protocols, and high-level structure.',
    canDelegate: true,
  },
  {
    id: 'Coder',
    name: 'Software Engineer',
    icon: '💻',
    badgeColor: ROLE_BADGE_CODER_COLOR,
    description: 'Implements clean code, refactors logic, and fixes workspace bugs.',
    canDelegate: false,
  },
  {
    id: 'Researcher',
    name: 'Researcher',
    icon: '🔍',
    badgeColor: ROLE_BADGE_RESEARCHER_COLOR,
    description: 'Gathers web intelligence, scans documentation, and analyzes references.',
    canDelegate: false,
  },
  {
    id: 'Reviewer',
    name: 'Code Reviewer',
    icon: '🛡️',
    badgeColor: ROLE_BADGE_REVIEWER_COLOR,
    description: 'Performs static analysis, reviews pull requests, and audits code quality.',
    canDelegate: false,
  },
  {
    id: 'Tester',
    name: 'QA & Test Engineer',
    icon: '🧪',
    badgeColor: ROLE_BADGE_TESTER_COLOR,
    description: 'Writes unit tests, verifies edge cases, and ensures quality assurance.',
    canDelegate: false,
  },
  {
    id: 'DevOps',
    name: 'DevOps & SRE',
    icon: '🚀',
    badgeColor: ROLE_BADGE_DEVOPS_COLOR,
    description: 'Automates builds, packaging, CI pipelines, and terminal tooling.',
    canDelegate: false,
  },
  {
    id: 'Generalist',
    name: 'Generalist',
    icon: '🤖',
    badgeColor: ROLE_BADGE_GENERALIST_COLOR,
    description: 'All-round assistant capable of general support, reasoning, and tasks.',
    canDelegate: true,
  },
] as const;

export interface AgentProfile {
  customName: string;
  role: string;
  currentOrder?: string | null;
  orderHistory?: string[];
  delegatedFrom?: string | null;
}

const STORAGE_KEY = 'copilot_pixel_agent_roster_profiles';

interface SimpleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getStorage(): SimpleStorage | null {
  try {
    const g = globalThis as unknown as { localStorage?: SimpleStorage };
    if (g && typeof g.localStorage !== 'undefined' && g.localStorage !== null) {
      return g.localStorage;
    }
  } catch {
    // Ignore storage access errors
  }
  return null;
}

export function getAllRoles(): readonly AgentRoleDefinition[] {
  return AGENT_ROLES;
}

export function getRoleDefinition(roleId: string | undefined): AgentRoleDefinition {
  const norm = (roleId || '').toLowerCase().trim();
  if (norm === 'designer' || norm.includes('design')) {
    return {
      id: 'Designer',
      name: 'UI/UX Designer',
      icon: '🎨',
      badgeColor: ROLE_BADGE_DESIGNER_COLOR,
      description: 'Crafts pixel art, CSS aesthetics, layouts, and responsive components.',
      canDelegate: false,
    };
  }
  if (norm === 'teammate' || norm.includes('break')) {
    return {
      id: 'Teammate',
      name: 'Teammate (On Break)',
      icon: '☕',
      badgeColor: ROLE_BADGE_TEAMMATE_COLOR,
      description: 'Resting in the Break Room (coffee, snack, Steam Deck) ready for delegation.',
      canDelegate: false,
    };
  }
  if (norm === 'software architect') return AGENT_ROLES[1];
  if (norm === 'software engineer') return AGENT_ROLES[2];
  if (norm === 'code reviewer') return AGENT_ROLES[4];
  if (norm === 'test engineer') return AGENT_ROLES[5];
  if (norm === 'devops engineer') return AGENT_ROLES[6];

  const match = AGENT_ROLES.find((r) => r.id.toLowerCase() === norm);
  return (
    match || {
      id: 'Generalist',
      name: 'Generalist',
      icon: '🤖',
      badgeColor: ROLE_BADGE_GENERALIST_COLOR,
      description: 'General AI Assistant',
      canDelegate: true,
    }
  );
}

export function getRandomEnglishName(usedNames: string[] = []): string {
  const usedSet = new Set(usedNames.map((n) => n.toLowerCase()));
  const available = ENGLISH_NAMES_50.filter((name) => !usedSet.has(name.toLowerCase()));
  const pool = available.length > 0 ? available : ENGLISH_NAMES_50;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function loadAgentProfiles(): Record<string, AgentProfile> {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveAgentProfiles(profiles: Record<string, AgentProfile>): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    // ignore storage errors
  }
}

export function getAgentProfile(
  agentId: number | string,
  existingNames: string[] = [],
  isLeadOrFirst = false,
): AgentProfile {
  const profiles = loadAgentProfiles();
  const key = String(agentId);
  if (profiles[key]) {
    const p = profiles[key];
    if (!isLeadOrFirst && p.role === 'Lead') {
      p.role = 'Coder';
      profiles[key] = p;
      saveAgentProfiles(profiles);
    }
    return p;
  }

  const assignedName = getRandomEnglishName(existingNames);
  const defaultRole = isLeadOrFirst ? 'Lead' : 'Coder';
  const newProfile: AgentProfile = {
    customName: assignedName,
    role: defaultRole,
    currentOrder: null,
    orderHistory: [],
    delegatedFrom: null,
  };
  profiles[key] = newProfile;
  saveAgentProfiles(profiles);
  return newProfile;
}

export function updateAgentProfile(
  agentId: number | string,
  updates: Partial<AgentProfile>,
): AgentProfile {
  const profiles = loadAgentProfiles();
  const key = String(agentId);
  const current = profiles[key] || {
    customName: getRandomEnglishName(),
    role: 'Generalist',
    currentOrder: null,
    orderHistory: [],
  };

  const updated: AgentProfile = {
    ...current,
    ...updates,
    orderHistory: updates.currentOrder
      ? [...(current.orderHistory || []), updates.currentOrder].slice(-20)
      : current.orderHistory || [],
  };

  profiles[key] = updated;
  saveAgentProfiles(profiles);
  return updated;
}
