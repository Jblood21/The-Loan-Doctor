import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { fmt } from '@/lib/format';
import { api } from '@/lib/api';
import { CalcSelect, Headline, ResultPanel, Row, type CalcProps } from './_shared';

// 50 states + DC → 2-digit Census FIPS code.
const STATES: { value: string; label: string }[] = [
  ['01', 'Alabama'], ['02', 'Alaska'], ['04', 'Arizona'], ['05', 'Arkansas'], ['06', 'California'],
  ['08', 'Colorado'], ['09', 'Connecticut'], ['10', 'Delaware'], ['11', 'District of Columbia'], ['12', 'Florida'],
  ['13', 'Georgia'], ['15', 'Hawaii'], ['16', 'Idaho'], ['17', 'Illinois'], ['18', 'Indiana'], ['19', 'Iowa'],
  ['20', 'Kansas'], ['21', 'Kentucky'], ['22', 'Louisiana'], ['23', 'Maine'], ['24', 'Maryland'], ['25', 'Massachusetts'],
  ['26', 'Michigan'], ['27', 'Minnesota'], ['28', 'Mississippi'], ['29', 'Missouri'], ['30', 'Montana'], ['31', 'Nebraska'],
  ['32', 'Nevada'], ['33', 'New Hampshire'], ['34', 'New Jersey'], ['35', 'New Mexico'], ['36', 'New York'],
  ['37', 'North Carolina'], ['38', 'North Dakota'], ['39', 'Ohio'], ['40', 'Oklahoma'], ['41', 'Oregon'], ['42', 'Pennsylvania'],
  ['44', 'Rhode Island'], ['45', 'South Carolina'], ['46', 'South Dakota'], ['47', 'Tennessee'], ['48', 'Texas'], ['49', 'Utah'],
  ['50', 'Vermont'], ['51', 'Virginia'], ['53', 'Washington'], ['54', 'West Virginia'], ['55', 'Wisconsin'], ['56', 'Wyoming'],
].map(([value, label]) => ({ value, label }));

interface IncomeResult {
  name: string;
  medianIncome: number | null;
  moe: number | null;
  year: string;
  source: string;
}

export default function CountyIncome({ open, onClose }: CalcProps) {
  const [state, setState] = useState('');
  const [counties, setCounties] = useState<{ fips: string; name: string }[]>([]);
  const [countiesLoading, setCountiesLoading] = useState(false);
  const [county, setCounty] = useState('');
  const [result, setResult] = useState<IncomeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load the counties for the chosen state.
  useEffect(() => {
    setCounty('');
    setCounties([]);
    setResult(null);
    setError('');
    if (!state) return;
    let cancelled = false;
    setCountiesLoading(true);
    api
      .censusCounties(state)
      .then(({ counties: c }) => {
        if (!cancelled) setCounties(c || []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load counties from the Census Bureau. Try again shortly.');
      })
      .finally(() => {
        if (!cancelled) setCountiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state]);

  // Look up median income when a county is chosen.
  useEffect(() => {
    setResult(null);
    setError('');
    if (!state || !county) return;
    let cancelled = false;
    setLoading(true);
    api
      .censusIncome(state, county)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load income data from the Census Bureau. Try again shortly.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state, county]);

  const countyOptions = countiesLoading
    ? [{ value: '', label: 'Loading counties…' }]
    : [{ value: '', label: counties.length ? 'Select a county…' : 'Choose a state first' }, ...counties.map((c) => ({ value: c.fips, label: c.name }))];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="County Median Income"
      subtitle="Median household income by county — official U.S. Census Bureau data."
      width={720}
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-3.5">
          <CalcSelect
            label="State"
            value={state}
            onChange={setState}
            options={[{ value: '', label: 'Select a state…' }, ...STATES]}
          />
          <CalcSelect label="County" value={county} onChange={setCounty} options={countyOptions} />
          <div className="text-[11.5px] leading-[1.5] text-text-dim">
            Data comes live from the U.S. Census Bureau’s American Community Survey (ACS) 5-year estimates. Median
            household income is a real, citable figure — not an AI guess.
          </div>
        </div>

        <ResultPanel>
          {loading ? (
            <div className="py-6 text-center text-[13.5px] text-text-muted">Looking it up…</div>
          ) : error ? (
            <div className="py-6 text-[13.5px] text-danger">{error}</div>
          ) : result ? (
            <>
              <Headline
                label="Median Household Income"
                value={result.medianIncome != null ? fmt(result.medianIncome) : '—'}
                sub={`${result.name} · ${result.year} ACS 5-Year`}
              />
              {result.moe != null && result.medianIncome != null && (
                <Row label="Margin of error" value={`± ${fmt(result.moe)}`} />
              )}
              {result.medianIncome == null && (
                <div className="text-[12.5px] text-text-muted">The Census Bureau doesn’t publish an estimate for this county.</div>
              )}
              <div className="mt-3 text-[11.5px] leading-[1.5] text-text-dim">Source: {result.source}.</div>
            </>
          ) : (
            <div className="py-6 text-center text-[13.5px] text-text-muted">
              Pick a state and county to see its median household income.
            </div>
          )}
        </ResultPanel>
      </div>
    </Modal>
  );
}
