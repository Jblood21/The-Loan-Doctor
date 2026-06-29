import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge, StubNote } from '@/components/ui/Badge';
import { Card, SectionLabel, Divider } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { NumberField } from '@/components/ui/NumberField';
import { Label } from '@/components/ui/TextField';
import { PillGroup } from '@/components/ui/Pill';
import { computeHecm, HECM_MAX_CLAIM } from '@/lib/finance';
import { fmt } from '@/lib/format';
import type { HecmInputs, PayoutOption } from '@/types';

const PAYOUTS: { value: PayoutOption; label: string }[] = [
  { value: 'lump', label: 'Lump Sum' },
  { value: 'tenure', label: 'Tenure' },
  { value: 'line', label: 'Line of Credit' },
];

export default function Hecm() {
  const [hc, setHc] = useState<HecmInputs>({
    mode: 'refinance',
    age: 62,
    value: 500000,
    mortgage: 0,
    otherDebts: 0,
    payout: 'lump',
    rate: 6.5,
  });
  const set = (field: keyof HecmInputs, raw: string) => {
    const v = raw === '' ? 0 : parseFloat(raw);
    setHc((s) => ({ ...s, [field]: Number.isFinite(v) ? v : 0 }));
  };
  const isPurchase = hc.mode === 'purchase';

  const res = computeHecm({
    mode: hc.mode,
    age: hc.age,
    homeValue: hc.value,
    existingMortgage: hc.mortgage,
    otherDebts: hc.otherDebts,
    rate: hc.rate,
    payout: hc.payout,
  });

  const ageTooYoung = hc.age < 62;

  return (
    <div className="animate-lp-fade">
      <PageHeader
        badge={<Badge tone="teal">Reverse Mortgage · HECM</Badge>}
        title="HECM Calculator"
        subtitle="Estimate principal limit and payout options for borrowers 62+."
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* LEFT — inputs */}
        <Card className="p-6">
          <div className="mb-[22px]">
            <SegmentedControl
              options={[
                { value: 'refinance', label: 'Refinance / Equity' },
                { value: 'purchase', label: 'HECM for Purchase' },
              ]}
              value={hc.mode}
              onChange={(v) => setHc((s) => ({ ...s, mode: v as HecmInputs['mode'] }))}
            />
            <div className="mt-2.5 text-[12.5px] text-text-muted">
              {isPurchase
                ? 'Buy a new primary residence with a reverse mortgage — the borrower brings a down payment and makes no monthly mortgage payments.'
                : 'Tap equity in the current home; proceeds first pay off any existing mortgage and liens you choose to clear.'}
            </div>
          </div>

          <SectionLabel className="mb-4">BORROWER &amp; PROPERTY</SectionLabel>
          <div className="grid grid-cols-1 gap-x-[18px] gap-y-4 sm:grid-cols-2">
            <div>
              <Label>Youngest Borrower Age</Label>
              <NumberField value={hc.age} onChange={(v) => set('age', v)} ariaLabel="Youngest borrower age" />
              {ageTooYoung && <div className="mt-1.5 text-[12px] text-warn-text">HECM requires the youngest borrower to be 62 or older.</div>}
            </div>
            <div>
              <Label>{isPurchase ? 'Purchase Price' : 'Home Value'}</Label>
              <NumberField prefix="$" value={hc.value} onChange={(v) => set('value', v)} ariaLabel={isPurchase ? 'Purchase price' : 'Home value'} />
            </div>
            {!isPurchase && (
              <>
                <div>
                  <Label>Existing Mortgage Balance</Label>
                  <NumberField prefix="$" value={hc.mortgage} onChange={(v) => set('mortgage', v)} ariaLabel="Existing mortgage balance" />
                </div>
                <div>
                  <Label>Other Debts / Liens to Pay Off</Label>
                  <NumberField prefix="$" value={hc.otherDebts} onChange={(v) => set('otherDebts', v)} ariaLabel="Other debts to pay off" />
                </div>
              </>
            )}
            <div>
              <Label>Expected Rate (%)</Label>
              <NumberField suffix="%" value={hc.rate} onChange={(v) => set('rate', v)} ariaLabel="Expected rate" />
            </div>
          </div>

          {!isPurchase && (
            <>
              <Divider className="my-6" />
              <SectionLabel className="mb-3.5">PAYOUT OPTION</SectionLabel>
              <PillGroup
                variant="teal"
                options={PAYOUTS}
                value={hc.payout}
                onChange={(v) => setHc((s) => ({ ...s, payout: v }))}
              />
            </>
          )}
        </Card>

        {/* RIGHT — result */}
        <div className="sticky top-5 flex flex-col gap-4">
          <Card variant="result" className="p-6">
            <div className="text-[12.5px] font-semibold text-[#8fb8c9]">
              {isPurchase ? 'Down Payment Required (est.)' : 'Available to Borrower (est.)'}
            </div>
            <div className="num my-2 text-[42px] font-semibold tracking-[-1.5px] text-text-heading">
              {fmt(isPurchase ? res.requiredDownPayment : res.available)}
            </div>
            <div className="text-[13px] text-text-muted">
              Age {hc.age} · {(res.plf * 100).toFixed(1)}% PLF · {res.payoutLabel}
            </div>
            <div className="mt-5 flex flex-col gap-px">
              {(isPurchase
                ? [
                    { label: 'Purchase Price', value: fmt(hc.value), color: 'text-text-softer' },
                    { label: 'Principal Limit Factor', value: `${(res.plf * 100).toFixed(1)}%`, color: 'text-text-softer' },
                    { label: 'Reverse Mortgage Covers', value: fmt(res.grossPrincipalLimit), color: 'text-text-primary' },
                    { label: 'Borrower Down Payment', value: fmt(res.requiredDownPayment), color: 'text-warn-text' },
                  ]
                : [
                    { label: 'Max Claim Amount', value: fmt(res.maxClaim), color: 'text-text-softer' },
                    { label: 'Principal Limit Factor', value: `${(res.plf * 100).toFixed(1)}%`, color: 'text-text-softer' },
                    { label: 'Gross Principal Limit', value: fmt(res.grossPrincipalLimit), color: 'text-text-primary' },
                    { label: 'Less Mortgage & Debts', value: `–${fmt(res.payoffTotal)}`, color: 'text-warn-text' },
                  ]
              ).map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between border-b border-[rgba(140,165,195,0.08)] py-2.5"
                >
                  <span className="text-[13.5px] text-text-soft">{row.label}</span>
                  <span className={`num text-[14.5px] font-medium ${row.color}`}>{row.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <StubNote>
                {isPurchase
                  ? 'HECM for Purchase: the borrower’s down payment plus the reverse mortgage fund the purchase, with no monthly mortgage payment. '
                  : 'Proceeds first satisfy mandatory obligations (existing mortgage and any liens). '}
                PLFs are interpolated from HUD’s factor tables and capped at the FHA max claim amount ({fmt(HECM_MAX_CLAIM)}).
                Swap in the exact HUD PLF lookup for production.
              </StubNote>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
