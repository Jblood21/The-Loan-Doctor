import { Router } from 'express';
import { requireAuth } from '../auth.js';

const router = Router();

// Median household income by county, from the U.S. Census Bureau American Community
// Survey (ACS) 5-year estimates, table B19013. Real, citable data — no API key
// required for modest use (set CENSUS_API_KEY to raise limits).
//
// We try a few recent ACS vintages in order until one responds, so the tool keeps
// working when the newest year's dataset isn't published yet (a common cause of a
// "can't pull the data" failure).
const YEARS = String(process.env.CENSUS_YEARS || `${process.env.CENSUS_YEAR || '2023'},2022,2021`)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const KEY = process.env.CENSUS_API_KEY ? `&key=${encodeURIComponent(process.env.CENSUS_API_KEY)}` : '';

async function censusFetch(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Census API ${res.status}`);
  return res.json();
}

// Try each ACS year until one returns a usable array; returns { rows, year }.
async function tryYears(query) {
  let lastErr;
  for (const year of YEARS) {
    try {
      const rows = await censusFetch(`https://api.census.gov/data/${year}/acs/acs5${query}${KEY}`);
      if (Array.isArray(rows) && rows.length > 1) return { rows, year };
      lastErr = new Error('empty result');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('census unavailable');
}

const fips2 = (v) => String(v || '').replace(/\D/g, '').slice(0, 2);
const fips3 = (v) => String(v || '').replace(/\D/g, '').slice(0, 3);

// GET /api/census/counties?state=<2-digit FIPS> → { year, counties: [{ fips, name }] }
router.get('/counties', requireAuth, async (req, res) => {
  const state = fips2(req.query.state);
  if (state.length !== 2) return res.status(400).json({ error: 'A 2-digit state FIPS code is required.' });
  try {
    const { rows, year } = await tryYears(`?get=NAME&for=county:*&in=state:${state}`);
    // rows[0] is the header; each data row is [NAME, state, county].
    const counties = rows
      .slice(1)
      .map((r) => ({ fips: fips3(r[2]), name: String(r[0] || '').replace(/,.*$/, '').trim() }))
      .filter((c) => c.fips && c.name)
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ year, counties });
  } catch {
    res.status(502).json({ error: 'Could not load counties from the Census Bureau right now. Please try again shortly.' });
  }
});

// GET /api/census/income?state=<FIPS>&county=<FIPS> → { name, medianIncome, moe, year, source }
router.get('/income', requireAuth, async (req, res) => {
  const state = fips2(req.query.state);
  const county = fips3(req.query.county);
  if (state.length !== 2 || !county) return res.status(400).json({ error: 'A state and county FIPS code are required.' });
  try {
    const { rows, year } = await tryYears(`?get=NAME,B19013_001E,B19013_001M&for=county:${county}&in=state:${state}`);
    const row = rows[1];
    if (!row) return res.status(404).json({ error: 'No median-income data found for that county.' });
    const val = Number(row[1]);
    const moe = Number(row[2]);
    res.json({
      name: String(row[0] || ''),
      // The Census uses large negative sentinels (e.g. -666666666) for "no estimate".
      medianIncome: Number.isFinite(val) && val >= 0 ? val : null,
      moe: Number.isFinite(moe) && moe >= 0 ? moe : null,
      year,
      source: `U.S. Census Bureau, American Community Survey 5-Year Estimates (${year}), table B19013`,
    });
  } catch {
    res.status(502).json({ error: 'Could not load income data from the Census Bureau right now. Please try again shortly.' });
  }
});

export default router;
