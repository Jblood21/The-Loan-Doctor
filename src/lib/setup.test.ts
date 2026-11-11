import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/context/SettingsContext';
import { setupStatus } from './setup';

describe('letterhead setup', () => {
  it('a new account starts with nothing of anyone else’s on it', () => {
    const text = JSON.stringify(DEFAULT_SETTINGS).toLowerCase();
    for (const leaked of ['summit', 'alan', '103895', '1790749', '801-', 'kaysville']) expect(text).not.toContain(leaked);
    const s = setupStatus(DEFAULT_SETTINGS);
    expect(s.complete).toBe(false);
    expect(s.requiredDone).toBe(0);
    expect(s.missing).toEqual(['Your name', 'Your NMLS number', 'Company name']);
  });

  it('needs a name, an NMLS number and a company, and nothing else', () => {
    expect(setupStatus({ name: 'Pat Lee', nmls: '123', company: 'Lee Lending' }).complete).toBe(true);
    expect(setupStatus({ name: 'Pat Lee', nmls: '123', lenderName: 'Lee Lending' }).complete).toBe(true);
    expect(setupStatus({ name: 'Pat Lee', nmls: '123' }).complete).toBe(false);
    expect(setupStatus({ nmls: '123', company: 'X' }).missing).toEqual(['Your name']);
  });

  it('says what is missing in plain words', () => {
    expect(setupStatus({}).missingPhrase).toBe('name, NMLS number and company name');
    expect(setupStatus({ name: 'Pat' }).missingPhrase).toBe('NMLS number and company name');
    expect(setupStatus({ name: 'Pat', nmls: '1' }).missingPhrase).toBe('company name');
    expect(setupStatus({ name: 'Pat', nmls: '1', company: 'Co' }).missingPhrase).toBe('');
  });

  it('does not count blanks or spaces', () => {
    const s = setupStatus({ name: '   ', nmls: '', company: '\n' });
    expect(s.requiredDone).toBe(0);
  });

  it('reports progress and treats phone/email/logo as optional', () => {
    const s = setupStatus({ name: 'Pat', nmls: '1', company: 'Co', phone: '555' });
    expect(s.complete).toBe(true);
    expect(s.items.find((i) => i.key === 'contact')?.done).toBe(false); // needs both phone and email
    expect(s.items.find((i) => i.key === 'logo')?.done).toBe(false);
    expect(setupStatus({ name: 'Pat', nmls: '1' }).requiredDone).toBe(2);
  });
});
