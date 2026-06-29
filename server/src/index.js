// LoanDr. API server — Express + JSON store + JWT auth.
// In production it also serves the built frontend (single-service deploy).

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { seed } from './store.js';
import authRoutes from './routes/auth.js';
import settingsRoutes from './routes/settings.js';
import scenarioRoutes from './routes/scenarios.js';
import adminRoutes from './routes/admin.js';
import losRoutes from './routes/los.js';
import preApprovalRoutes from './routes/preapproval.js';

const app = express();
const PORT = process.env.PORT || 4000;

// CORS — reflect any origin in dev; lock to CORS_ORIGIN list in production.
const allowed = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowed.length ? allowed : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));

// Throttle auth endpoints against brute-force.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false });

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/scenarios', scenarioRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/los', losRoutes);
app.use('/api/preapproval', preApprovalRoutes);

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
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

seed();
app.listen(PORT, () => {
  console.log(`\n  LoanDr. API → http://localhost:${PORT}`);
  console.log(`  Health      → http://localhost:${PORT}/api/health`);
  console.log('  Seeded accounts:');
  console.log(`    admin  → admin@loandr.app / ${process.env.ADMIN_PASSWORD || 'admin123'}`);
  if (process.env.SEED_DEMO_USER !== 'false') {
    console.log(`    demo   → ${process.env.DEMO_EMAIL || 'demo@lender.com'} / ${process.env.DEMO_PASSWORD || 'demo1234'}\n`);
  }
});
