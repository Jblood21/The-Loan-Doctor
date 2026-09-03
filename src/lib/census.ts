// County median household income lookups.
//
// These read from a STATIC SNAPSHOT baked into the app (src/data/countyIncome.ts),
// so the tool loads instantly with no live network calls. The data is real, citable
// U.S. Census Bureau ACS 5-year data — refresh the snapshot annually by re-pulling
// from the Census Bureau. The async signatures are kept so the UI is unchanged.

import { COUNTY_INCOME, COUNTY_INCOME_SOURCE, COUNTY_INCOME_YEAR } from '@/data/countyIncome';

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

export async function censusCounties(state: string): Promise<{ year: string; counties: CountyOption[] }> {
  const s = fips2(state);
  const entry = COUNTY_INCOME[s];
  if (!entry) throw new Error('That state is not available yet.');
  return {
    year: COUNTY_INCOME_YEAR,
    counties: entry.counties.map((c) => ({ fips: c.fips, name: c.name })),
  };
}

export async function censusIncome(state: string, county: string): Promise<IncomeResult> {
  const s = fips2(state);
  const c = fips3(county);
  const entry = COUNTY_INCOME[s];
  const found = entry?.counties.find((x) => x.fips === c);
  if (!entry || !found) throw new Error('No data found for that county.');
  return {
    name: `${found.name}, ${entry.state}`,
    medianIncome: found.medianIncome,
    moe: null,
    year: COUNTY_INCOME_YEAR,
    source: COUNTY_INCOME_SOURCE,
  };
}
