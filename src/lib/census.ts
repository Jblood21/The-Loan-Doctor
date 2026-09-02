// U.S. Census Bureau lookups for the County Median Income tool.
//
// Real, citable figures from the American Community Survey (ACS) 5-year estimates,
// table B19013 (median household income) — not AI guesses.
//
// We try TWO paths so the tool keeps working wherever it's hosted:
//   1. Our own backend proxy (/api/census/*). Server-side calls have no CORS
//      restriction and this is the primary, most reliable path.
//   2. A direct call to api.census.gov from the browser, as a fallback if the
//      backend can't be reached.
// If both fail we throw an Error whose message says exactly what went wrong on
// each path, so the failure is diagnosable instead of a generic "try again".

import { api, ApiError } from './api';

// Recent ACS 5-year vintages, newest first. We try each until one responds, so the
// tool keeps working before the newest year's dataset is published.
const YEARS = ['2023', '2022', '2021'];
const BASE = 'https://api.census.gov/data';

const fips2 = (v: string) => String(v || '').replace(/\D/g, '').slice(0, 2);
const fips3 = (v: string) => String(v || '').replace(/\D/g, '').slice(0, 3);

export interface CountyOption {
  fips: string;
  name: string;
}

export interface IncomeResult {
  name: string;
  medianIncome: number | null;
  moe: number | null;
  year: string;
  source: string;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Census API ${res.status}`);
  return res.json();
}

// Try each ACS year until one returns a usable table; returns { rows, year }.
async function tryYears(query: string): Promise<{ rows: string[][]; year: string }> {
  let lastErr: unknown;
  for (const year of YEARS) {
    try {
      const rows = (await fetchJson(`${BASE}/${year}/acs/acs5${query}`)) as string[][];
      if (Array.isArray(rows) && rows.length > 1) return { rows, year };
      lastErr = new Error('empty result');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('census unavailable');
}

// ---- Direct-from-browser implementations (fallback path) -------------------

async function directCounties(state: string): Promise<{ year: string; counties: CountyOption[] }> {
  const { rows, year } = await tryYears(`?get=NAME&for=county:*&in=state:${state}`);
  const counties = rows
    .slice(1)
    .map((r) => ({ fips: fips3(r[2]), name: String(r[0] || '').replace(/,.*$/, '').trim() }))
    .filter((c) => c.fips && c.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { year, counties };
}

async function directIncome(state: string, county: string): Promise<IncomeResult> {
  const { rows, year } = await tryYears(`?get=NAME,B19013_001E,B19013_001M&for=county:${county}&in=state:${state}`);
  const row = rows[1];
  if (!row) throw new Error('No median-income data found for that county.');
  const val = Number(row[1]);
  const moe = Number(row[2]);
  return {
    name: String(row[0] || ''),
    // The Census uses large negative sentinels (e.g. -666666666) for "no estimate".
    medianIncome: Number.isFinite(val) && val >= 0 ? val : null,
    moe: Number.isFinite(moe) && moe >= 0 ? moe : null,
    year,
    source: `U.S. Census Bureau, American Community Survey 5-Year Estimates (${year}), table B19013`,
  };
}

// ---- Error description helper ----------------------------------------------

function describe(err: unknown): string {
  if (err instanceof ApiError) return `server ${err.status}: ${err.message}`;
  if (err instanceof TypeError) return 'browser blocked the request (CORS/offline)';
  return err instanceof Error ? err.message : String(err);
}

// ---- Public API: server proxy first, direct browser call as fallback -------

export async function censusCounties(state: string): Promise<{ year: string; counties: CountyOption[] }> {
  const s = fips2(state);
  if (s.length !== 2) throw new Error('A 2-digit state FIPS code is required.');
  let serverErr: unknown;
  try {
    return await api.censusCounties(s);
  } catch (e) {
    serverErr = e;
  }
  try {
    return await directCounties(s);
  } catch (directErr) {
    throw new Error(`Could not load counties. (${describe(serverErr)}; direct ${describe(directErr)})`);
  }
}

export async function censusIncome(state: string, county: string): Promise<IncomeResult> {
  const s = fips2(state);
  const c = fips3(county);
  if (s.length !== 2 || !c) throw new Error('A state and county FIPS code are required.');
  let serverErr: unknown;
  try {
    return await api.censusIncome(s, c);
  } catch (e) {
    serverErr = e;
  }
  try {
    return await directIncome(s, c);
  } catch (directErr) {
    throw new Error(`Could not load income data. (${describe(serverErr)}; direct ${describe(directErr)})`);
  }
}
