// New accounts must never print someone else's name, license numbers, logo or photo.
// The owner login keeps its own letterhead, filled in once on the server.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startServer } from './helpers.mjs';

const OWNER = 'owner@test.local';
const ownerId = `seed-${crypto.createHash('sha256').update(OWNER).digest('hex').slice(0, 24)}`;

async function freshStore(preload) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecamp-lh-'));
  if (preload) fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify(preload));
  Object.assign(process.env, {
    DATA_DIR: dir, NODE_ENV: 'production', SEED_DEMO_USER: 'false', JWT_SECRET: 'x'.repeat(40),
    ADMIN_EMAIL: 'admin@test.local', ADMIN_PASSWORD: 'admin-pass-123', OWNER_EMAIL: OWNER, OWNER_PASSWORD: 'owner-pass-123',
  });
  vi.resetModules();
  const store = await import('../src/store.js');
  return { store, dir };
}

describe('the owner login’s letterhead', () => {
  it('is filled in once, with the logo and photo, and only for the owner', async () => {
    const { store, dir } = await freshStore();
    store.seed();
    const owner = store.getSettings(ownerId);
    expect(owner).toMatchObject({ company: 'Summit Home Loans', nmls: '103895', lenderNmls: '1790749' });
    expect(owner.logoDataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(owner.headshotDataUrl).toMatch(/^data:image\/png;base64,/);

    expect(JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8')).migrations.ownerLetterhead).toBe(true);

    const other = store.addUser({ email: 'newbie@test.local', password: 'password1', name: 'New Officer' });
    expect(store.getSettings(other.id)).toBeNull();
    const admin = store.findUserByEmail('admin@test.local');
    expect(store.getSettings(admin.id)).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('never overwrites what the owner changes afterwards', async () => {
    const { store, dir } = await freshStore();
    store.seed();
    store.setSettings(ownerId, { lenderNmls: 'CHANGED', logoDataUrl: '' });
    store.seed(); // a restart
    expect(store.getSettings(ownerId)).toMatchObject({ lenderNmls: 'CHANGED', logoDataUrl: '' });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps anything the owner had already saved, and fills only the gaps', async () => {
    const { store, dir } = await freshStore({ settings: { [ownerId]: { nmls: '555', phone: '801-000-0000' } } });
    store.seed();
    expect(store.getSettings(ownerId)).toMatchObject({ nmls: '555', phone: '801-000-0000', lenderNmls: '1790749' });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('waits until an owner login is configured', async () => {
    const { store, dir } = await freshStore();
    delete process.env.OWNER_EMAIL;
    delete process.env.OWNER_PASSWORD;
    store.seed();
    expect(store.getSettings(ownerId)).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('letters and PDFs for everyone else', () => {
  let s;
  let token;
  const logo = `data:image/jpeg;base64,${fs.readFileSync(new URL('../src/assets/letterhead-logo.jpg', import.meta.url)).toString('base64')}`;
  beforeAll(async () => {
    s = await startServer({});
    token = (await s.register('newbie@test.local', { name: 'New Officer' })).token;
  });
  afterAll(() => s.stop());

  const letter = (extra = {}) =>
    s.call('POST', '/preapproval/pdf', {
      token,
      body: { style: 'classic', showHeadshot: true, title: 'Pre-Approval', borrowerName: 'Bo Buyer', officer: { name: 'New Officer', nmls: '111' }, lender: { name: 'New Lending', nmls: '222' }, paragraphs: ['Hello.'], ...extra },
    });

  it('start with nothing saved: no borrowed name, license number or logo', async () => {
    const r = await s.call('GET', '/settings', { token });
    expect(r.json.settings).toEqual({});
  });

  it('print no logo or photo that the sender did not supply', async () => {
    const plain = await letter();
    expect(plain.status).toBe(200);
    expect(plain.text.startsWith('%PDF')).toBe(true);
    expect(plain.text).not.toContain('DCTDecode'); // a JPEG (the old built-in logo) would show up here
    expect(plain.text.length).toBeLessThan(60_000); // the old built-in photo alone was ~260 KB
  });

  it('use the sender’s own logo when they have one', async () => {
    const mine = await letter({ logo });
    expect(mine.status).toBe(200);
    expect(mine.text).toContain('DCTDecode');
  });
});
