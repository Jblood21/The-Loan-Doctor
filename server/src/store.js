// Simple JSON-file persistence for LoanDr.
//
// Zero native dependencies — the whole store lives in server/data/db.json so the
// app runs anywhere Node runs. Swap this module for Postgres/SQLite in production
// (the route handlers only touch the helpers exported here).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = { users: [], settings: {}, scenarios: {}, los: {}, counters: { preApprovals: 0 } };

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
export function addUser({ email, password, passwordHash, name = '', company = '', phone = '', nmls = '', role = 'user', status = 'Active', scenarioCount = 0 }) {
  const user = {
    id: randomUUID(),
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

/** Seed an admin, a demo LO, and the sample users shown on the admin dashboard. */
export function seed() {
  load();
  if (db.users.length > 0) return; // already seeded

  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  addUser({
    email: 'admin@loandr.app',
    password: adminPassword,
    name: 'Owner Admin',
    company: 'LoanDr.',
    nmls: '000001',
    role: 'admin',
    status: 'Active',
  });

  if (process.env.SEED_DEMO_USER !== 'false') {
    addUser({
      email: process.env.DEMO_EMAIL || 'demo@lender.com',
      password: process.env.DEMO_PASSWORD || 'demo1234',
      name: 'John Smith',
      company: 'ABC Mortgage',
      phone: '(800) 555-1234',
      nmls: '123456',
      role: 'user',
      status: 'Active',
    });
  }

  // Sample users that populate the admin Users table.
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
  persist();
}
