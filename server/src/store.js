// Simple JSON-file persistence for LoanDr.
//
// Zero native dependencies — the whole store lives in server/data/db.json so the
// app runs anywhere Node runs. Swap this module for Postgres/SQLite in production
// (the route handlers only touch the helpers exported here).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash, createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';

/** Stable, deterministic id for a seeded account so it survives a data wipe with the
 *  same id — keeps a logged-in session valid across restarts (e.g. Render free tier). */
function stableSeedId(email) {
  return `seed-${createHash('sha256').update(String(email || '').toLowerCase()).digest('hex').slice(0, 24)}`;
}

/** Deterministic per-user webhook token derived from the server secret + user id.
 *  Unguessable (HMAC) yet stable across restarts, so the webhook URL never changes. */
function webhookTokenFor(userId) {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me-in-production';
  return `whk_${createHmac('sha256', secret).update(`webhook:${userId}`).digest('hex').slice(0, 32)}`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR is configurable so production can point it at a persistent volume
// (e.g. a Render disk). Without a persistent disk the free tier wipes this on
// every restart/redeploy — which resets accounts, webhook tokens, and loans.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = { users: [], settings: {}, scenarios: {}, los: {}, losBorrowers: {}, shares: {}, counters: { preApprovals: 0 } };

let db = structuredClone(EMPTY);

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function load() {
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      db = { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
    } catch {
      db = structuredClone(EMPTY);
    }
  }
  return db;
}

export function persist() {
  ensureDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ---- users -------------------------------------------------------------
export function getUsers() {
  return db.users;
}
export function findUserByEmail(email) {
  return db.users.find((u) => u.email === String(email || '').toLowerCase());
}
export function findUserById(id) {
  return db.users.find((u) => u.id === id);
}
export function addUser({ id, email, password, passwordHash, name = '', company = '', phone = '', nmls = '', role = 'user', status = 'Active', scenarioCount = 0 }) {
  const user = {
    id: id || randomUUID(),
    email: String(email).toLowerCase(),
    passwordHash: passwordHash || bcrypt.hashSync(password, 12),
    name,
    company,
    phone,
    nmls,
    role,
    status,
    scenarioCount,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  persist();
  return user;
}
export function updateUser(id, patch) {
  const u = findUserById(id);
  if (!u) return null;
  Object.assign(u, patch);
  persist();
  return u;
}

// ---- settings ----------------------------------------------------------
export function getSettings(userId) {
  return db.settings[userId] || null;
}
export function setSettings(userId, patch) {
  db.settings[userId] = { ...(db.settings[userId] || {}), ...patch };
  persist();
  return db.settings[userId];
}

// ---- scenarios ---------------------------------------------------------
export function getScenarios(userId) {
  return db.scenarios[userId] || [];
}
export function setScenarios(userId, list) {
  db.scenarios[userId] = list;
  persist();
  return list;
}
export function scenarioCount(userId) {
  const list = db.scenarios[userId];
  if (Array.isArray(list)) return list.length;
  const u = findUserById(userId);
  return u?.scenarioCount || 0;
}

// ---- LOS connections ---------------------------------------------------
export function setLos(userId, provider, connected) {
  db.los[userId] = { ...(db.los[userId] || {}), [provider]: connected };
  persist();
  return db.los[userId];
}
export function getLos(userId) {
  return db.los[userId] || {};
}

// ---- inbound LOS borrowers (pushed via Zapier webhook) -----------------
export function getLosBorrowers(userId) {
  return db.losBorrowers[userId] || [];
}
/** Upsert borrowers (dedupe by loan number, else name+address); newest first, capped. */
export function upsertLosBorrowers(userId, items) {
  const existing = db.losBorrowers[userId] || [];
  const key = (b) => (b.loanNumber ? `ln:${b.loanNumber}` : `na:${b.name}|${b.address}`);
  const map = new Map(existing.map((b) => [key(b), b]));
  for (const it of items) map.set(key(it), { ...map.get(key(it)), ...it });
  const merged = Array.from(map.values()).sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0)).slice(0, 300);
  db.losBorrowers[userId] = merged;
  persist();
  return merged;
}
export function clearLosBorrowers(userId) {
  db.losBorrowers[userId] = [];
  persist();
}

// ---- per-user webhook token (identifies the Zap source) ----------------
// The token is deterministic (HMAC of the server secret + user id), so it stays the
// same across restarts/redeploys even if the datastore is wiped — the webhook URL you
// paste into Zapier never changes. Matching also accepts the derived token directly,
// so a POST works even before the token has been persisted after a fresh boot.
export function findUserByWebhookToken(token) {
  if (!token) return undefined;
  return db.users.find((u) => u.webhookToken === token || webhookTokenFor(u.id) === token);
}
export function ensureWebhookToken(userId) {
  const u = findUserById(userId);
  if (!u) return null;
  const token = webhookTokenFor(userId);
  if (u.webhookToken !== token) {
    u.webhookToken = token;
    persist();
  }
  return u.webhookToken;
}
export function regenerateWebhookToken(userId) {
  // Deterministic tokens can't be rotated without a persistent salt, so this simply
  // re-confirms the stable URL rather than issuing one that would die on the next restart.
  return ensureWebhookToken(userId);
}

// ---- shareable quote snapshots -----------------------------------------
export function createShare(userId, snapshot) {
  const id = randomUUID().replace(/-/g, '').slice(0, 12);
  db.shares[id] = { id, userId, ...snapshot, createdAt: new Date().toISOString() };
  // Bound growth: keep the newest 500 shares.
  const ids = Object.keys(db.shares);
  if (ids.length > 500) {
    ids.sort((a, b) => (db.shares[a].createdAt < db.shares[b].createdAt ? -1 : 1));
    for (const old of ids.slice(0, ids.length - 500)) delete db.shares[old];
  }
  persist();
  return id;
}
export function getShare(id) {
  return db.shares[id] || null;
}

// ---- counters ----------------------------------------------------------
export function incPreApprovals() {
  db.counters.preApprovals = (db.counters.preApprovals || 0) + 1;
  persist();
  return db.counters.preApprovals;
}
export function getCounters() {
  return db.counters;
}

/** Strip secrets before sending a user to the client. */
export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    company: u.company,
    phone: u.phone,
    nmls: u.nmls,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
    scenarioCount: scenarioCount(u.id),
  };
}

/** Seed the admin account, an optional owner login, and (in non-prod) demo data. */
export function seed() {
  load();
  if (db.users.length > 0) return; // already seeded

  const isProd = process.env.NODE_ENV === 'production';

  // --- Admin account --------------------------------------------------------
  // In production NEVER fall back to a known default password. If ADMIN_PASSWORD
  // is unset, generate a random one and warn loudly so no guessable admin ships.
  let adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    if (isProd) {
      adminPassword = randomUUID();
      console.warn(
        '[seed] ADMIN_PASSWORD is not set — generated a random admin password you cannot see. ' +
          'Set ADMIN_PASSWORD in your environment and redeploy to choose your own.',
      );
    } else {
      adminPassword = 'admin123';
    }
  }
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@loandr.app').toLowerCase();
  addUser({
    id: stableSeedId(adminEmail),
    email: adminEmail,
    password: adminPassword,
    name: 'Owner Admin',
    company: process.env.OWNER_COMPANY || 'LoanDr.',
    nmls: '000001',
    role: 'admin',
    status: 'Active',
  });

  // --- Owner / personal loan-officer login ----------------------------------
  // Seeded from env so you always have a normal account even when signups are
  // closed. Recommended for production: set OWNER_EMAIL + OWNER_PASSWORD.
  // Stable id so a re-seed after a data wipe keeps the same account — your login
  // session (and webhook URL) survives restarts even without a persistent disk.
  if (process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD) {
    addUser({
      id: stableSeedId(process.env.OWNER_EMAIL),
      email: process.env.OWNER_EMAIL,
      password: process.env.OWNER_PASSWORD,
      name: process.env.OWNER_NAME || 'Loan Officer',
      company: process.env.OWNER_COMPANY || '',
      phone: process.env.OWNER_PHONE || '',
      nmls: process.env.OWNER_NMLS || '',
      role: 'user',
      status: 'Active',
    });
  }

  // --- Demo data (development / explicit opt-in only) ------------------------
  // Never seed the throwaway demo account or sample users in production unless
  // explicitly asked for (SEED_DEMO_USER=true), so a shared link stays clean.
  const seedDemo = process.env.SEED_DEMO_USER === 'true' || (!isProd && process.env.SEED_DEMO_USER !== 'false');
  if (seedDemo) {
    const demoEmail = process.env.DEMO_EMAIL || 'demo@lender.com';
    addUser({
      id: stableSeedId(demoEmail),
      email: demoEmail,
      password: process.env.DEMO_PASSWORD || 'demo1234',
      name: 'John Smith',
      company: 'ABC Mortgage',
      phone: '(800) 555-1234',
      nmls: '123456',
      role: 'user',
      status: 'Active',
    });

    // Sample users that populate the admin Users table (demo flavor only).
    const samples = [
      ['Sarah Chen', 'sarah.chen@summitlend.com', 'Summit Lending', 42, 'Active'],
      ['Marcus Webb', 'm.webb@bayfinance.com', 'Bay Finance', 18, 'Active'],
      ['Elena Ruiz', 'elena@homefirstmtg.com', 'HomeFirst Mortgage', 7, 'Trial'],
      ['David Okafor', 'd.okafor@apexloans.com', 'Apex Loans', 63, 'Active'],
      ['Priya Patel', 'priya.patel@northstarfg.com', 'Northstar Funding', 29, 'Inactive'],
    ];
    for (const [name, email, company, count, status] of samples) {
      addUser({ email, password: randomUUID(), name, company, role: 'user', status, scenarioCount: count });
    }
  }

  persist();
}
