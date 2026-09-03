import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { fmt } from '@/lib/format';
import { censusCounties, censusIncome, type IncomeResult } from '@/lib/census';
import { CalcSelect, Headline, ResultPanel, Row, type CalcProps } from './_shared';

// Supported states → 2-digit Census FIPS code.
const STATES: { value: string; label: string }[] = [
  ['49', 'Utah'], ['16', 'Idaho'], ['48', 'Texas'], ['12', 'Florida'], ['06', 'California'],
].map(([value, label]) => ({ value, label }));

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
    censusCounties(state)
      .then(({ counties: c }) => {
        if (!cancelled) setCounties(c || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load counties from the Census Bureau.');
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
    censusIncome(state, county)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load income data from the Census Bureau.');
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
      subtitle="Median household income by county, with 80% & 100% for Home Possible eligibility."
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
            Median household income by county from the U.S. Census Bureau’s American Community Survey (ACS) 5-year
            estimates — a real, citable figure, not an AI guess. Built-in snapshot, refreshed periodically.
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
              {result.medianIncome != null && (
                <>
                  <Row label="100% of median income" value={fmt(result.medianIncome)} />
                  <Row
                    label="80% of median income"
                    value={fmt(Math.round(result.medianIncome * 0.8))}
                    color="text-good"
                  />
                  {result.moe != null && <Row label="Margin of error" value={`± ${fmt(result.moe)}`} />}
                  <div className="mt-3 rounded-[10px] border border-[rgba(52,211,153,0.22)] bg-[rgba(52,211,153,0.07)] px-3.5 py-2.5 text-[11.5px] leading-[1.55] text-text-soft">
                    Freddie Mac <span className="font-semibold text-good">Home Possible</span> caps qualifying income at{' '}
                    <span className="font-semibold text-good">80% of area median income (AMI)</span>. AMI is set at the
                    census-tract level and can differ from this county figure — confirm exact eligibility on{' '}
                    <a
                      href="https://sf.freddiemac.com/working-with-us/affordable-lending/home-possible-eligibility-map"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-brand-teal underline"
                    >
                      Freddie Mac’s Home Possible map
                    </a>
                    .
                  </div>
                </>
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
