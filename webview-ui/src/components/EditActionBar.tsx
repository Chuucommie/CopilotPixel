import { useState } from 'react';

import type { useEditorActions } from '../hooks/useEditorActions.js';
import type { EditorState } from '../office/editor/editorState.js';
import { getLayoutPresets, type LayoutPresetDefinition } from '../office/layout/layoutPresets.js';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

interface EditActionBarProps {
  editor: ReturnType<typeof useEditorActions>;
  editorState: EditorState;
  onApplyPreset?: (preset: LayoutPresetDefinition) => void;
}

export function EditActionBar({ editor, editorState: es, onApplyPreset }: EditActionBarProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showPresetsModal, setShowPresetsModal] = useState(false);

  const undoDisabled = es.undoStack.length === 0;
  const redoDisabled = es.redoStack.length === 0;

  return (
    <>
      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10 flex gap-4 items-center pixel-panel p-4">
        <Button
          variant={undoDisabled ? 'disabled' : 'default'}
          size="md"
          onClick={undoDisabled ? undefined : editor.handleUndo}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </Button>
        <Button
          variant={redoDisabled ? 'disabled' : 'default'}
          size="md"
          onClick={redoDisabled ? undefined : editor.handleRedo}
          title="Redo (Ctrl+Y)"
        >
          Redo
        </Button>
        <Button
          variant={es.isDirty ? 'accent' : 'default'}
          size="md"
          onClick={editor.handleSave}
          title="Save layout"
        >
          Save
        </Button>
        <Button
          variant="default"
          size="md"
          onClick={() => setShowPresetsModal(true)}
          title="Choose a pre-defined office layout preset"
        >
          📐 Presets
        </Button>
        {es.isDirty && (
          <>
            {!showResetConfirm ? (
              <Button
                variant="default"
                size="md"
                onClick={() => setShowResetConfirm(true)}
                title="Reset to last saved layout"
              >
                Reset
              </Button>
            ) : (
              <div className="flex gap-4 items-center">
                <span className="text-base text-reset-text">Reset?</span>
                <Button
                  variant="default"
                  size="md"
                  className="bg-danger text-white"
                  onClick={() => {
                    setShowResetConfirm(false);
                    editor.handleReset();
                  }}
                >
                  Yes
                </Button>
                <Button variant="default" size="md" onClick={() => setShowResetConfirm(false)}>
                  No
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {showPresetsModal && (
        <Modal
          isOpen={showPresetsModal}
          onClose={() => setShowPresetsModal(false)}
          title="Office Layout Presets"
        >
          <div className="p-4 flex flex-col gap-3 max-w-lg">
            <p className="text-xs text-text-muted">
              Choose a pre-configured office layout (2 Normal, 2 Medium, 2 Large, or Default HQ).
            </p>
            <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
              {getLayoutPresets().map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center justify-between p-3 rounded border border-border/70 hover:border-accent hover:bg-white/5 transition-colors gap-3"
                >
                  <div className="flex flex-col overflow-hidden min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-text">{preset.name}</span>
                      <span className="text-2xs uppercase px-1.5 py-0.5 rounded bg-accent/20 text-accent-bright border border-accent/40 font-semibold shrink-0">
                        {preset.category}
                      </span>
                    </div>
                    <span className="text-2xs text-text-muted mt-1 leading-snug">
                      {preset.description}
                    </span>
                    <span className="text-2xs text-accent-bright/80 font-mono mt-0.5">
                      Dimensions: {preset.layout.cols}×{preset.layout.rows} tiles
                    </span>
                  </div>
                  <Button
                    variant="accent"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      if (onApplyPreset) {
                        onApplyPreset(preset);
                        setShowPresetsModal(false);
                      }
                    }}
                  >
                    Apply
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
