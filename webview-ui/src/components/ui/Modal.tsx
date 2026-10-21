import { type ReactNode, useEffect, useId } from 'react';

import { Button } from './Button.js';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** z-index for backdrop (modal gets +1). Default 50 */
  zIndex?: number;
  className?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  zIndex = 50,
  className = '',
}: ModalProps) {
  const titleId = useId();

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50"
        style={{ zIndex }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bg border-2 border-border rounded-none shadow-pixel p-4 min-w-xs ${className}`}
        style={{ zIndex: zIndex + 1 }}
      >
        <div className="flex items-center justify-between py-4 px-10 border-b border-border mb-4">
          <span id={titleId} className="text-accent-bright text-2xl">
            {title}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close dialog"
            title="Close (Esc)"
          >
            ✕
          </Button>
        </div>
        {children}
      </div>
    </>
  );
}
