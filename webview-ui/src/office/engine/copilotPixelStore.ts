// webview-ui/src/office/engine/copilotPixelStore.ts
// Persistent store for CopilotPixel background agents that never disappear.

const STORAGE_KEY = 'copilotpixel_persistent_agents';

export interface PersistentAgentData {
  id: number;
  customName: string;
  role: string;
  palette: number;
  hueShift: number;
  seatId: string | null;
  isSubagent: boolean;
  parentAgentId: number | null;
  currentOrder?: string | null;
  delegatedFrom?: string | null;
  orderStatus?: string | null;
  orderProgressMessage?: string | null;
  orderModelName?: string | null;
  isTakingBreak?: boolean;
  breakType?: 'coffee' | 'snack' | 'steamdeck' | null;
}

const memoryStore: Record<string, string> = {};

interface SimpleStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function getStorage(): SimpleStorage {
  try {
    const g = globalThis as unknown as { localStorage?: SimpleStorage };
    if (g && g.localStorage && typeof g.localStorage.getItem === 'function') {
      return g.localStorage;
    }
  } catch {
    // Ignore and use fallback
  }

  return {
    getItem: (key: string) => memoryStore[key] ?? null,
    setItem: (key: string, value: string) => {
      memoryStore[key] = value;
    },
    removeItem: (key: string) => {
      delete memoryStore[key];
    },
  };
}

export function loadCopilotPixelAgents(): PersistentAgentData[] {
  const storage = getStorage();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCopilotPixelAgents(agents: PersistentAgentData[]): void {
  const storage = getStorage();
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(agents));
  } catch {
    // Ignore quota or write errors
  }
}

export function saveOrUpdateCopilotPixelAgent(agent: PersistentAgentData): void {
  const all = loadCopilotPixelAgents();
  const idx = all.findIndex((a) => a.id === agent.id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...agent };
  } else {
    all.push(agent);
  }
  saveCopilotPixelAgents(all);
}

export function removeCopilotPixelAgent(id: number): void {
  const all = loadCopilotPixelAgents();
  const filtered = all.filter((a) => a.id !== id);
  saveCopilotPixelAgents(filtered);
}

export function clearCopilotPixelAgentsStore(): void {
  const storage = getStorage();
  storage.removeItem(STORAGE_KEY);
}
