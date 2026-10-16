import { describe, expect, it } from 'vitest';

import { copilotProvider } from '../src/providers/index.js';

describe('consent copy', () => {
  const { headline, disclosure } = copilotProvider.consentDisclosure();

  it('carries all key disclosure facts', () => {
    const full = `${headline}\n\n${disclosure}`;
    expect(full).toContain('~/.copilot/hooks/');
    expect(full).toContain('127.0.0.1');
    expect(full).toContain('Settings → Instant Detection (Hooks)');
    expect(full).toContain('CopilotAgents');
  });

  it('headline is concise and disclosure contains full terms', () => {
    expect(headline).toBe('Enable Copilot CLI hooks?');
    expect(disclosure).toContain('~/.copilot/hooks/');
    expect(disclosure).toContain('127.0.0.1');
  });

  it('is a paragraph-separated block', () => {
    expect(disclosure.split('\n\n').length).toBeGreaterThanOrEqual(3);
  });
});
