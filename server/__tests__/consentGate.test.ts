import { describe, expect, it } from 'vitest';

import { consentActionFor, hooksConsentRequest } from '../src/providers/hook/consentGate.js';
import { copilotProvider } from '../src/providers/index.js';

describe('hooksConsentRequest — when to ask', () => {
  const askable = {
    installed: false,
    hooksEnabled: true,
    consentAnswered: false,
    privileged: true,
  };

  const expectedDisclosure = copilotProvider.consentDisclosure();

  it('asks the population with nothing installed', () => {
    expect(hooksConsentRequest(askable, copilotProvider)).toEqual({
      type: 'hooksConsentRequest',
      providerId: 'copilot',
      headline: expectedDisclosure.headline,
      disclosure: expectedDisclosure.disclosure,
    });
  });

  it("ships the provider's disclosure, not a summary of it", () => {
    const request = hooksConsentRequest(askable, copilotProvider);
    expect(request?.disclosure).toBe(expectedDisclosure.disclosure);
    expect(request?.disclosure).toContain('~/.copilot/hooks/');
  });

  it.each([
    ['our hooks are already installed', { installed: true }],
    ['the ask was already answered', { consentAnswered: true }],
    ['the user turned hooks off', { hooksEnabled: false }],
    ['the client could not act on an answer', { privileged: false }],
  ])('does not ask when %s', (_why, override) => {
    expect(hooksConsentRequest({ ...askable, ...override }, copilotProvider)).toBeNull();
  });

  it('never asks an unprivileged client, even when everything else lines up', () => {
    expect(hooksConsentRequest({ ...askable, privileged: false }, copilotProvider)).toBeNull();
  });
});

describe('consentActionFor — what an answer means', () => {
  const untouched = { installed: false, consent: 'unanswered' } as const;
  const landed = { installed: true, consent: 'granted' } as const;
  const grantOnly = { installed: false, consent: 'granted' } as const;
  const declined = { installed: false, consent: 'declined' } as const;

  it('installs on an exact install, whatever the earlier answer left', () => {
    expect(consentActionFor('install', untouched)).toBe('install');
    expect(consentActionFor('install', landed)).toBe('install');
    expect(consentActionFor('install', grantOnly)).toBe('install');
    expect(consentActionFor('install', declined)).toBe('install');
  });

  it('persists hooks-off on an exact never with nothing installed', () => {
    expect(consentActionFor('never', untouched)).toBe('persistOff');
    expect(consentActionFor('never', declined)).toBe('persistOff');
    expect(consentActionFor('never', grantOnly)).toBe('persistOff');
  });

  it('takes the full toggle-off path on a never over a landed install', () => {
    expect(consentActionFor('never', landed)).toBe('disable');
  });

  it('writes nothing on a notNow with nothing to undo', () => {
    expect(consentActionFor('notNow', untouched)).toBe('none');
  });

  it('reverts the install on a notNow over a landed install', () => {
    expect(consentActionFor('notNow', landed)).toBe('revert');
  });

  it('reverts a grant left by a failed install, with nothing on disk', () => {
    expect(consentActionFor('notNow', grantOnly)).toBe('revert');
  });

  it("reverts a decline on a notNow over a Don't Ask Again", () => {
    expect(consentActionFor('notNow', declined)).toBe('revertDecline');
  });

  it('routes a notNow over a declined-but-still-installed state to revertDecline', () => {
    expect(consentActionFor('notNow', { installed: true, consent: 'declined' })).toBe(
      'revertDecline',
    );
  });

  it.each([
    'yes',
    'y',
    '',
    'Install',
    'INSTALL',
    'installl',
    'not-now',
    'notnow',
    'NEVER',
    'never ',
    42,
    true,
    null,
    undefined,
    {},
    ['install'],
  ])('writes nothing for %j', (junk) => {
    expect(consentActionFor(junk, untouched)).toBe('none');
    expect(consentActionFor(junk, landed)).toBe('none');
    expect(consentActionFor(junk, declined)).toBe('none');
  });
});
