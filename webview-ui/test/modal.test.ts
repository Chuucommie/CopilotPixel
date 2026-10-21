import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Modal } from '../src/components/ui/Modal.js';

describe('Modal Accessibility & UX', () => {
  it('renders null when isOpen is false', () => {
    const html = renderToString(
      React.createElement(Modal, {
        isOpen: false,
        onClose: vi.fn(),
        title: 'Test Modal',
        children: React.createElement('p', null, 'Content'),
      }),
    );
    expect(html).toBe('');
  });

  it('renders with role=dialog, aria-modal=true, and aria-labelledby matching title id', () => {
    const html = renderToString(
      React.createElement(Modal, {
        isOpen: true,
        onClose: vi.fn(),
        title: 'Settings Dialog',
        children: React.createElement('p', null, 'Modal Content'),
      }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('Settings Dialog');
    expect(html).toContain('aria-label="Close dialog"');
    expect(html).toContain('title="Close (Esc)"');
    expect(html).toContain('aria-hidden="true"');
  });
});
