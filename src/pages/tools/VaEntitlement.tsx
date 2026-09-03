import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { vaEntitlement, VA_BASELINE_LIMIT } from '@/lib/finance';
import { fmt, pct } from '@/lib/format';
import { CalcField, CalcSelect, Headline, ResultPanel, Row, type CalcProps } from './_shared';

export default function VaEntitlement({ open, onClose }: CalcProps) {
  const [price, setPrice] = useState(650000);
  const [countyLimit, setCountyLimit] = useState(VA_BASELINE_LIMIT);
  const [status, setStatus] = useState('partial'); // full | partial
  const [priorLoan, setPriorLoan] = useState(250000);
  const [down, setDown] = useState(0);
  const [use, setUse] = useState('subsequent'); // first | subsequent
  const [exempt, setExempt] = useState('no'); // yes | no

  const set = (fn: (v: number) => void) => (v: string) => fn(v === '' ? 0 : parseFloat(v) || 0);
  const full = status === 'full';

  const res = vaEntitlement({
    purchasePrice: price,
    countyLoanLimit: countyLimit,
    fullEntitlement: full,
    priorLoanAmount: priorLoan,
    downPayment: down,
    subsequentUse: use === 'subsequent',
    fundingFeeExempt: exempt === 'yes',
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="VA Bonus Entitlement"
      subtitle="Second-tier entitlement, max $0-down loan, and any required down payment."
      width={760}
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1.1fr_1fr]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <CalcSelect
            label="Entitlement Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'partial', label: 'Partial (active VA loan)' },
              { value: 'full', label: 'Full / restored' },
            ]}
          />
          <CalcField label="Purchase Price" prefix="$" value={price} onChange={set(setPrice)} />
          {!full && <CalcField label="Prior VA Loan (still in use)" prefix="$" value={priorLoan} onChange={set(setPriorLoan)} />}
          <CalcField label="County Loan Limit" prefix="$" value={countyLimit} onChange={set(setCountyLimit)} />
          <CalcField label="Down Payment (optional)" prefix="$" value={down} onChange={set(setDown)} />
          <CalcSelect
            label="VA Loan Use"
            value={use}
            onChange={setUse}
            options={[
              { value: 'first', label: 'First use' },
              { value: 'subsequent', label: 'Subsequent use' },
            ]}
          />
          <CalcSelect
            label="Funding Fee Exempt?"
            value={exempt}
            onChange={setExempt}
            options={[
              { value: 'no', label: 'No' },
              { value: 'yes', label: 'Yes (disability)' },
            ]}
          />
        </div>

        <ResultPanel
          report={{
            key: 'va',
            title: 'VA Bonus Entitlement',
            headline: {
              label: 'Down Payment Required',
              value: fmt(res.requiredDownPayment),
              sub: full
                ? 'Full entitlement — no county limit, no money down.'
                : res.zeroDownEligible
                  ? 'Eligible for $0 down at this price.'
                  : `Price exceeds the $0-down max of ${fmt(res.maxZeroDownLoan)}.`,
            },
            inputs: [
              { label: 'Purchase Price', value: fmt(price) },
              { label: 'County Loan Limit', value: fmt(countyLimit) },
              { label: 'Entitlement Status', value: full ? 'Full / restored' : 'Partial' },
              { label: 'Down Payment', value: fmt(down) },
            ],
            rows: [
              { label: 'Max guaranty (25% of county limit)', value: fmt(res.maxGuaranty) },
              { label: 'Available entitlement', value: fmt(res.availableEntitlement) },
              { label: 'Max loan with $0 down', value: full ? 'No limit' : fmt(res.maxZeroDownLoan) },
              { label: 'VA funding fee', value: `${pct(res.fundingFeePct, 2)} · ${fmt(res.fundingFee)}` },
              { label: 'Loan amount', value: fmt(Math.max(0, price - down)) },
            ],
          }}
        >
          <Headline
            label="Down Payment Required"
            value={fmt(res.requiredDownPayment)}
            sub={
              full
                ? 'Full entitlement — no county limit, no money down (Blue Water Act).'
                : res.zeroDownEligible
                  ? 'Eligible for $0 down at this price.'
                  : `Price exceeds the $0-down max of ${fmt(res.maxZeroDownLoan)}.`
            }
          />
          <Row label="Max guaranty (25% of county limit)" value={fmt(res.maxGuaranty)} />
          <Row label="Entitlement already used" value={fmt(res.entitlementUsed)} />
          <Row label="Available entitlement" value={fmt(res.availableEntitlement)} color="text-text-primary" />
          <Row label="Max loan with $0 down" value={full ? 'No limit' : fmt(res.maxZeroDownLoan)} color="text-brand-teal" />
          <Row label="VA funding fee" value={`${pct(res.fundingFeePct, 2)} · ${fmt(res.fundingFee)}`} />
          <Row label="Loan amount" value={fmt(Math.max(0, price - down))} />
          <div className="mt-3 text-[12px] leading-[1.5] text-text-muted">
            VA guaranty + your down payment must total 25% of the price. Full or restored entitlement removes the county
            limit and the down-payment requirement (Blue Water Act, 2020). County one-unit limits vary — confirm yours.
          </div>
        </ResultPanel>
      </div>
    </Modal>
  );
}
