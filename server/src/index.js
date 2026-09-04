// LoanDr. API server — Express + JSON store + JWT auth.
// In production it also serves the built frontend (single-service deploy).

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { seed, dataDirInfo } from './store.js';
import authRoutes from './routes/auth.js';
import settingsRoutes from './routes/settings.js';
import scenarioRoutes from './routes/scenarios.js';
import adminRoutes from './routes/admin.js';
import losRoutes from './routes/los.js';
import preApprovalRoutes from './routes/preapproval.js';
import compareRoutes from './routes/compare.js';
import shareRoutes from './routes/share.js';
import aiRoutes from './routes/ai.js';
import censusRoutes from './routes/census.js';
import reportRoutes from './routes/report.js';

const app = express();
const PORT = process.env.PORT || 4000;
// Build/version stamp so you can verify which commit is actually live (Render sets
// RENDER_GIT_COMMIT/RENDER_GIT_BRANCH automatically). Visit /api/health to check.
const BUILD = {
  commit: (process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'unknown').slice(0, 7),
  branch: process.env.RENDER_GIT_BRANCH || process.env.GIT_BRANCH || 'unknown',
  startedAt: new Date().toISOString(),
};
app.set('trust proxy', 1); // behind Render/other TLS proxy — needed for correct client IPs (rate limiting)

// Security headers. CSP is left off because the SPA uses inline styles; the other
// hardening headers (HSTS, X-Content-Type-Options, frameguard, referrer policy) apply.
app.use(helmet({ contentSecurityPolicy: false }));

// CORS — reflect any origin in dev; lock to the CORS_ORIGIN list in production. The API
// and SPA ship as one service (same origin), so production needs cross-origin access
// only when a separate frontend host is configured; otherwise deny it rather than
// reflecting any origin with credentials.
const isProduction = process.env.NODE_ENV === 'production';
const allowed = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowed.length ? allowed : (isProduction ? false : true),
    credentials: true,
  }),
);
// 6mb so branding uploads (logo, signature, officer photo, all sent as data URLs in
// JSON) fit; endpoints are rate-limited, so this isn't a meaningful DoS widening.
app.use(express.json({ limit: '6mb' }));

// Throttle auth endpoints against brute-force, and the public webhook against abuse.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false });
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
// The AI assistant costs money per call — cap it; Census is a courtesy limit.
const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const censusLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

app.get('/api/health', (_req, res) => res.json({ ok: true, ...BUILD }));
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/scenarios', scenarioRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/los/webhook', webhookLimiter);
app.use('/api/los', losRoutes);
app.use('/api/preapproval', preApprovalRoutes);
app.use('/api/compare', compareRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);
app.use('/api/census', censusLimiter, censusRoutes);

// Unknown API routes → JSON 404 (before the static SPA fallback).
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built frontend in production (single-service deploy). The Vite build
// output lives at the repo root in dist/. Any non-/api path falls back to index.html
// so client-side routes (/compare, /hecm, …) resolve on refresh / direct link.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '..', '..', 'dist');
if (process.env.SERVE_CLIENT !== 'false' && fs.existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  console.log(`  Serving frontend from ${distPath}`);
}

// Error handler (last).
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // Client errors from body parsing (malformed JSON, oversized payload) carry a 4xx
  // status — return that instead of masking it as a 500.
  const status = err.status || err.statusCode;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: err.type === 'entity.too.large' ? 'Payload too large' : 'Invalid request body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// The committed dev default is never used to sign anything — when JWT_SECRET is unset,
// the store falls back to a strong random secret it persists (see store.serverSecret()).
// That closes the forgery hole, but on an EPHEMERAL data dir the random secret is
// regenerated on every redeploy, which silently logs everyone out and changes the LOS
// webhook URL. Recommend (don't require) an explicit JWT_SECRET so both stay stable.
const DEV_JWT_DEFAULT = 'dev-secret-change-me-in-production';
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEV_JWT_DEFAULT)) {
  console.warn('\n  ⚠ JWT_SECRET is not set in production — using a persisted random secret.');
  console.warn('    Set a long, random JWT_SECRET (e.g. `openssl rand -hex 48`) so sessions and the');
  console.warn('    LOS webhook URL stay stable across redeploys, especially on an ephemeral disk.\n');
}

seed();
app.listen(PORT, () => {
  const isProd = process.env.NODE_ENV === 'production';
  console.log(`\n  LoanDr. API → http://localhost:${PORT}`);
  console.log(`  Health      → http://localhost:${PORT}/api/health`);

  // Storage durability — the #1 cause of "it forgot my login". Make it loud in the logs.
  const store = dataDirInfo();
  if (store.persistent) {
    console.log(`  Storage      → ${store.dir}  [persistent — accounts & data survive restarts]`);
  } else if (isProd) {
    console.warn(`  ⚠ Storage    → ${store.dir}  [EPHEMERAL] — this resets on every redeploy, so logins and data will NOT be saved.`);
    console.warn('    Fix: attach a persistent disk mounted at /var/data (or set DATA_DIR to a mounted path) in your host settings, then redeploy.');
  } else {
    console.log(`  Storage      → ${store.dir}  [local dev]`);
  }

  if (isProd) {
    // Never print real credentials — just confirm which accounts can log in so you
    // can verify your Render env vars from the logs.
    console.log(`  Admin login ready → ${(process.env.ADMIN_EMAIL || 'admin@loandr.app').trim().toLowerCase()} (use your ADMIN_PASSWORD)`);
    if (process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD) {
      console.log(`  Owner login ready → ${process.env.OWNER_EMAIL.trim().toLowerCase()} (use your OWNER_PASSWORD)`);
    } else {
      console.warn('  ⚠ No owner login configured — set OWNER_EMAIL and OWNER_PASSWORD in your environment to get a personal login.');
    }
  } else {
    console.log('  Seeded accounts (dev):');
    console.log(`    admin  → ${process.env.ADMIN_EMAIL || 'admin@loandr.app'} / ${process.env.ADMIN_PASSWORD || 'admin123'}`);
    if (process.env.SEED_DEMO_USER !== 'false') {
      console.log(`    demo   → ${process.env.DEMO_EMAIL || 'demo@lender.com'} / ${process.env.DEMO_PASSWORD || 'demo1234'}`);
    }
    console.log('');
  }
});
