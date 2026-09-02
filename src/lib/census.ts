// Client-side U.S. Census Bureau lookups.
//
// We call the Census American Community Survey (ACS) 5-year API DIRECTLY from the
// browser rather than proxying through our own server. The public ACS endpoint
// supports CORS and needs no API key for modest use, and calling it from the
// visitor's browser avoids any server-side outbound-network restriction (a common
// reason the tool "can't pull the data" when hosted). Real, citable figures — not
// AI guesses.

// Recent ACS 5-year vintages, newest first. We try each until one responds, so the
// tool keeps working before the newest year's dataset is published.
const YEARS = ['2023', '2022', '2021'];

const BASE = 'https://api.census.gov/data';

const fips2 = (v: string) => String(v || '').replace(/\D/g, '').slice(0, 2);
const fips3 = (v: string) => String(v || '').replace(/\D/g, '').slice(0, 3);

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

export interface CountyOption {
  fips: string;
  name: string;
}

export async function censusCounties(state: string): Promise<{ year: string; counties: CountyOption[] }> {
  const s = fips2(state);
  if (s.length !== 2) throw new Error('A 2-digit state FIPS code is required.');
  const { rows, year } = await tryYears(`?get=NAME&for=county:*&in=state:${s}`);
  // rows[0] is the header; each data row is [NAME, state, county].
  const counties = rows
    .slice(1)
    .map((r) => ({ fips: fips3(r[2]), name: String(r[0] || '').replace(/,.*$/, '').trim() }))
    .filter((c) => c.fips && c.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { year, counties };
}

export interface IncomeResult {
  name: string;
  medianIncome: number | null;
  moe: number | null;
  year: string;
  source: string;
}

export async function censusIncome(state: string, county: string): Promise<IncomeResult> {
  const s = fips2(state);
  const c = fips3(county);
  if (s.length !== 2 || !c) throw new Error('A state and county FIPS code are required.');
  const { rows, year } = await tryYears(`?get=NAME,B19013_001E,B19013_001M&for=county:${c}&in=state:${s}`);
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
