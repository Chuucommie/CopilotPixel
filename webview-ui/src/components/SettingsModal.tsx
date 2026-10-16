import { useRef, useState } from 'react';

import { isSoundEnabled, setSoundEnabled } from '../notificationSound.js';
import { isBrowserRuntime } from '../runtime.js';
import { transport } from '../transport/index.js';
import { Button } from './ui/Button.js';
import { Checkbox } from './ui/Checkbox.js';
import { MenuItem } from './ui/MenuItem.js';
import { Modal } from './ui/Modal.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
  alwaysShowOverlay: boolean;
  onToggleAlwaysShowOverlay: () => void;
  /** Whether headless agents (adopted, no terminal to focus) render translucent. */
  ghostHeadlessAgents: boolean;
  onToggleGhostHeadlessAgents: () => void;
  externalAssetDirectories: string[];
  watchAllSessions: boolean;
  onToggleWatchAllSessions: () => void;
  /** ACTUAL install state (the hooksStatus message), not the hooksEnabled
   *  preference. The preference defaults to true while first-run consent is
   *  still pending, so binding the checkbox to it renders "on" over an empty
   *  hook settings. */
  hooksInstalled: boolean;
  onToggleHooksEnabled: () => void;
  /** Whether the areas overlay is rendered outside of the Areas edit tool. */
  showAreas: boolean;
  onToggleShowAreas: () => void;
  /** Hide the Show Areas checkbox entirely when areas are unavailable. */
  showAreasAvailable: boolean;
  /** Browser-native layout export (standalone only; VS Code uses the host save dialog). */
  onExportLayout: () => void;
  /** Browser-native layout import from a chosen file (standalone only). */
  onImportLayout: (file: File) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  isDebugMode,
  onToggleDebugMode,
  alwaysShowOverlay,
  onToggleAlwaysShowOverlay,
  ghostHeadlessAgents,
  onToggleGhostHeadlessAgents,
  externalAssetDirectories,
  watchAllSessions,
  onToggleWatchAllSessions,
  hooksInstalled,
  onToggleHooksEnabled,
  showAreas,
  onToggleShowAreas,
  showAreasAvailable,
  onExportLayout,
  onImportLayout,
}: SettingsModalProps) {
  const [soundLocal, setSoundLocal] = useState(isSoundEnabled);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cpxModelPref, setCpxModelPref] = useState<'cheapest' | 'copilot' | 'gemini'>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('copilotpixel_model_preference');
      if (saved === 'cheapest' || saved === 'copilot' || saved === 'gemini') {
        return saved;
      }
    }
    return 'cheapest';
  });

  const handleSetCpxModel = (val: 'cheapest' | 'copilot' | 'gemini') => {
    setCpxModelPref(val);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('copilotpixel_model_preference', val);
    }
  };
  const [assetDirDraft, setAssetDirDraft] = useState('');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings">
      {/* Open Sessions Folder opens an OS file manager — impossible in the browser. */}
      {!isBrowserRuntime && (
        <MenuItem
          onClick={() => {
            transport.send({ type: 'openSessionsFolder' });
            onClose();
          }}
        >
          Open Sessions Folder
        </MenuItem>
      )}
      <MenuItem
        onClick={() => {
          if (isBrowserRuntime) {
            onExportLayout();
          } else {
            transport.send({ type: 'exportLayout' });
          }
          onClose();
        }}
      >
        Export Layout
      </MenuItem>
      <MenuItem
        onClick={() => {
          if (isBrowserRuntime) {
            // Open the native file picker; the import is applied in onChange below.
            fileInputRef.current?.click();
          } else {
            transport.send({ type: 'importLayout' });
            onClose();
          }
        }}
      >
        Import Layout
      </MenuItem>
      {isBrowserRuntime && (
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset the value so re-selecting the same file fires change again.
            e.target.value = '';
            if (file) {
              onImportLayout(file);
              onClose();
            }
          }}
        />
      )}
      {/* Browser has no native directory picker, so accept a typed absolute path. */}
      {isBrowserRuntime ? (
        <div className="flex items-center gap-4 py-4 px-10">
          <input
            type="text"
            value={assetDirDraft}
            placeholder="Absolute asset directory path"
            onChange={(e) => setAssetDirDraft(e.target.value)}
            className="flex-1 min-w-0 text-xs py-2 px-4 bg-bg border-2 border-border rounded-none text-text"
          />
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              const path = assetDirDraft.trim();
              if (!path) return;
              transport.send({ type: 'addExternalAssetDirectory', path });
              setAssetDirDraft('');
            }}
            className="shrink-0"
          >
            Add
          </Button>
        </div>
      ) : (
        <MenuItem
          onClick={() => {
            transport.send({ type: 'addExternalAssetDirectory' });
            onClose();
          }}
        >
          Add Asset Directory
        </MenuItem>
      )}
      {externalAssetDirectories.map((dir) => (
        <div key={dir} className="flex items-center justify-between py-4 px-10 gap-8">
          <span
            className="text-xs text-text-muted overflow-hidden text-ellipsis whitespace-nowrap"
            title={dir}
          >
            {dir.split(/[/\\]/).pop() ?? dir}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => transport.send({ type: 'removeExternalAssetDirectory', path: dir })}
            className="shrink-0"
          >
            x
          </Button>
        </div>
      ))}
      {/* CopilotPixel Background AI Model Configuration */}
      <div className="py-4 px-10 border-t border-border">
        <div className="text-xs font-bold uppercase tracking-wider text-accent-bright mb-2">
          CopilotPixel Background AI Model
        </div>
        <p className="text-2xs text-text-muted mb-3">
          Select which model CopilotPixel background agents should prefer. Prioritizing lightweight
          economy models saves subscription limits while keeping background autonomy fast.
        </p>
        <div className="flex flex-col gap-2">
          <label className="flex items-start gap-2.5 p-2 rounded border border-border/60 hover:border-accent hover:bg-white/5 cursor-pointer transition-colors">
            <input
              type="radio"
              name="cpx_model"
              value="cheapest"
              checked={cpxModelPref === 'cheapest'}
              onChange={() => handleSetCpxModel('cheapest')}
              className="mt-0.5"
            />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-text">
                Auto: Lowest Cost / Fast (Recommended)
              </span>
              <span className="text-2xs text-text-muted">
                Automatically uses lightweight models across active providers (e.g. gpt-4o-mini,
                gemini-flash, luna).
              </span>
            </div>
          </label>
          <label className="flex items-start gap-2.5 p-2 rounded border border-border/60 hover:border-accent hover:bg-white/5 cursor-pointer transition-colors">
            <input
              type="radio"
              name="cpx_model"
              value="copilot"
              checked={cpxModelPref === 'copilot'}
              onChange={() => handleSetCpxModel('copilot')}
              className="mt-0.5"
            />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-text">GitHub Copilot Economy</span>
              <span className="text-2xs text-text-muted">
                Routes exclusively through GitHub Copilot using low-tier models (gpt-4o-mini /
                luna).
              </span>
            </div>
          </label>
          <label className="flex items-start gap-2.5 p-2 rounded border border-border/60 hover:border-accent hover:bg-white/5 cursor-pointer transition-colors">
            <input
              type="radio"
              name="cpx_model"
              value="gemini"
              checked={cpxModelPref === 'gemini'}
              onChange={() => handleSetCpxModel('gemini')}
              className="mt-0.5"
            />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-text">Google Gemini Fast</span>
              <span className="text-2xs text-text-muted">
                Routes through Google Gemini using fast high-quota models (e.g. gemini-flash / 3.8
                flash).
              </span>
            </div>
          </label>
        </div>
      </div>

      <Checkbox
        label="Sound Notifications"
        checked={soundLocal}
        onChange={() => {
          const newVal = !isSoundEnabled();
          setSoundEnabled(newVal);
          setSoundLocal(newVal);
          transport.send({ type: 'setSoundEnabled', enabled: newVal });
        }}
      />
      <Checkbox
        label="Watch All Sessions"
        checked={watchAllSessions}
        onChange={onToggleWatchAllSessions}
      />
      <Checkbox
        label="Instant Detection (Hooks)"
        checked={hooksInstalled}
        onChange={onToggleHooksEnabled}
      />
      <Checkbox
        label="Always Show Labels"
        checked={alwaysShowOverlay}
        onChange={onToggleAlwaysShowOverlay}
      />
      {/* Headless agents are the office's only terminal-less citizens in VS Code.
          Standalone has no terminals at all, so nothing there would ever ghost. */}
      {!isBrowserRuntime && (
        <Checkbox
          label="Display Headless as Ghosts"
          checked={ghostHeadlessAgents}
          onChange={onToggleGhostHeadlessAgents}
        />
      )}
      {showAreasAvailable && (
        <Checkbox label="Show Areas" checked={showAreas} onChange={onToggleShowAreas} />
      )}
      <Checkbox label="Debug View" checked={isDebugMode} onChange={onToggleDebugMode} />
    </Modal>
  );
}
