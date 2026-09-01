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
  return `seed-${createHash('sha256').update(normalizeEmail(email)).digest('hex').slice(0, 24)}`;
}

/** Deterministic per-user webhook token derived from the server secret + user id.
 *  Unguessable (HMAC) yet stable across restarts, so the webhook URL never changes. */
function webhookTokenFor(userId) {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me-in-production';
  return `whk_${createHmac('sha256', secret).update(`webhook:${userId}`).digest('hex').slice(0, 32)}`;
}

/** One shared webhook for the whole deployment — the same URL for everyone. Loans
 *  posted here land in a single shared pool that every user sees. */
export const SHARED_LOS_KEY = '__shared__';
export function sharedWebhookToken() {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me-in-production';
  return `whk_${createHmac('sha256', secret).update('webhook:shared').digest('hex').slice(0, 32)}`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DATA_DIR = path.join(__dirname, '..', 'data');
// Common persistent-disk mount points to auto-detect (Render, Fly, etc.).
const KNOWN_MOUNTS = ['/var/data', '/data'];

// Resolve where the JSON store lives. Order of preference:
//   1. DATA_DIR (explicit override — always wins).
//   2. A known persistent-disk mount that actually exists, so data survives
//      restarts even if the operator forgot to also set DATA_DIR.
//   3. The in-repo data/ folder (fine for local dev; EPHEMERAL on hosts that
//      reset the filesystem on redeploy — see dataDirInfo()).
function resolveDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  for (const p of KNOWN_MOUNTS) {
    try {
      if (fs.statSync(p).isDirectory()) return p;
    } catch {
      /* not mounted */
    }
  }
  return REPO_DATA_DIR;
}
const DATA_DIR = resolveDataDir();
const DB_FILE = path.join(DATA_DIR, 'db.json');

/** Describe the storage location + whether it looks durable, for startup logging. */
export function dataDirInfo() {
  const explicit = !!process.env.DATA_DIR;
  const onKnownMount = KNOWN_MOUNTS.some((m) => DATA_DIR === m || DATA_DIR.startsWith(m + '/'));
  // Persistent when an operator pointed us somewhere on purpose, or we landed on a
  // real mounted disk. The in-repo folder is treated as ephemeral in production.
  const persistent = explicit || onKnownMount;
  return { dir: DATA_DIR, persistent, explicit, onKnownMount };
}

const EMPTY = { users: [], settings: {}, scenarios: {}, los: {}, losBorrowers: {}, losWebhookLog: [], shares: {}, preApprovals: {}, counters: { preApprovals: 0 } };

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
  // Atomic write: fill a temp file then rename over the target, so a crash
  // mid-write can never leave a truncated/corrupt db.json.
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

// ---- users -------------------------------------------------------------
/** Trim + lowercase an email so stray whitespace/case can't cause a login miss. */
export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}
export function getUsers() {
  return db.users;
}
export function findUserByEmail(email) {
  const e = normalizeEmail(email);
  return db.users.find((u) => u.email === e);
}
export function findUserById(id) {
  return db.users.find((u) => u.id === id);
}
export function addUser({ id, email, password, passwordHash, name = '', company = '', phone = '', nmls = '', role = 'user', status = 'Active', scenarioCount = 0 }) {
  const user = {
    id: id || randomUUID(),
    email: normalizeEmail(email),
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
// Dedup key: a loan number identifies a loan, but we also include the name so two
// DIFFERENT people can never collapse into one just because a Zap sent a blank or
// constant loan-number field (the previous "only one borrower shows" failure mode).
const borrowerKey = (b) =>
  b.loanNumber ? `ln:${b.loanNumber}|${(b.name || '').toLowerCase()}` : `na:${(b.name || '').toLowerCase()}|${(b.address || '').toLowerCase()}`;

/** Upsert borrowers; existing entries with the same key are updated, newest first, capped. */
export function upsertLosBorrowers(userId, items) {
  const existing = db.losBorrowers[userId] || [];
  const map = new Map(existing.map((b) => [borrowerKey(b), b]));
  for (const it of items) map.set(borrowerKey(it), { ...map.get(borrowerKey(it)), ...it });
  const merged = Array.from(map.values()).sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0)).slice(0, 300);
  db.losBorrowers[userId] = merged;
  persist();
  return merged;
}
export function clearLosBorrowers(userId) {
  db.losBorrowers[userId] = [];
  persist();
}

// ---- webhook activity log (diagnostics) --------------------------------
// Keeps the most recent raw inbound payloads so you can SEE exactly what Zapier
// sent (field names + values) and how many borrowers were extracted from each.
export function addWebhookLog(entry) {
  const list = db.losWebhookLog || [];
  list.unshift(entry);
  db.losWebhookLog = list.slice(0, 25);
  persist();
}
export function getWebhookLog() {
  return db.losWebhookLog || [];
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

// ---- issued pre-approvals (history per loan officer) -------------------
export function getPreApprovals(userId) {
  return db.preApprovals[userId] || [];
}
/** Record an issued pre-approval; newest first, capped. Returns the saved record. */
export function addPreApproval(userId, record) {
  const rec = { id: randomUUID().replace(/-/g, '').slice(0, 12), issuedAt: new Date().toISOString(), ...record };
  const list = db.preApprovals[userId] || [];
  list.unshift(rec);
  db.preApprovals[userId] = list.slice(0, 500);
  persist();
  return rec;
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

/** Create the account if it doesn't exist; otherwise refresh only what the
 *  environment should control (password/role), preserving in-app profile edits.
 *  This is what guarantees the admin/owner login always matches the current env
 *  vars — even when the account already exists on a persistent disk. */
function ensureSeedAccount({ id, email, password, role, updatePassword = true, ...rest }) {
  const existing = findUserByEmail(email);
  if (existing) {
    const patch = {};
    if (updatePassword) patch.passwordHash = bcrypt.hashSync(password, 12);
    if (role && existing.role !== role) patch.role = role;
    if (Object.keys(patch).length) updateUser(existing.id, patch);
    return existing;
  }
  return addUser({ id, email, password, role, ...rest });
}

/** Ensure the admin + owner logins match the environment on every boot, and seed
 *  demo data only on a fresh (empty) database. */
export function seed() {
  load();
  const isProd = process.env.NODE_ENV === 'production';

  // One-shot factory reset: set RESET_DATA=true to wipe ALL data on boot, then
  // the admin/owner accounts are re-created fresh below. Unset it afterward so it
  // doesn't wipe on every restart.
  if (process.env.RESET_DATA === 'true') {
    db = structuredClone(EMPTY);
    persist();
    console.warn('[seed] RESET_DATA=true — wiped ALL data (users, scenarios, loans). Remove RESET_DATA in your environment so it stops wiping on every boot.');
  }

  const wasEmpty = db.users.length === 0;

  // --- Admin account (ensured every boot) -----------------------------------
  // In production NEVER fall back to a known default password. If ADMIN_PASSWORD
  // is unset, generate a random one (create-only, never churn it on reboot).
  // Trim env passwords — a trailing space/newline pasted into a host's env UI is a
  // classic "my password is wrong" cause.
  const adminPwEnv = (process.env.ADMIN_PASSWORD || '').trim();
  const hasAdminPassword = !!adminPwEnv;
  let adminPassword = adminPwEnv;
  if (!adminPassword) {
    adminPassword = isProd ? randomUUID() : 'admin123';
    if (isProd) console.warn('[seed] ADMIN_PASSWORD is not set — using a random admin password. Set ADMIN_PASSWORD and redeploy to choose your own.');
  }
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL || 'admin@loandr.app');
  ensureSeedAccount({
    id: stableSeedId(adminEmail),
    email: adminEmail,
    password: adminPassword,
    role: 'admin',
    updatePassword: hasAdminPassword, // only overwrite when explicitly configured
    name: 'Owner Admin',
    company: process.env.OWNER_COMPANY || 'LoanDr.',
    nmls: '000001',
    status: 'Active',
  });

  // --- Owner login (ensured every boot when configured) ---------------------
  // Env is the source of truth: whatever OWNER_EMAIL/OWNER_PASSWORD are set to,
  // that login works — created if missing, password refreshed if it already
  // exists. This fixes "I set my password in Render but it says incorrect."
  const ownerEmail = normalizeEmail(process.env.OWNER_EMAIL);
  const ownerPassword = (process.env.OWNER_PASSWORD || '').trim();
  if (ownerEmail && ownerPassword) {
    ensureSeedAccount({
      id: stableSeedId(ownerEmail),
      email: ownerEmail,
      password: ownerPassword,
      role: 'user',
      name: process.env.OWNER_NAME || 'Loan Officer',
      company: process.env.OWNER_COMPANY || '',
      phone: process.env.OWNER_PHONE || '',
      nmls: process.env.OWNER_NMLS || '',
      status: 'Active',
    });
  }

  // --- Demo data (only on a fresh database) ---------------------------------
  const seedDemo = process.env.SEED_DEMO_USER === 'true' || (!isProd && process.env.SEED_DEMO_USER !== 'false');
  if (wasEmpty && seedDemo) {
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
