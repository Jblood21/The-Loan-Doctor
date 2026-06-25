import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge, StubNote } from '@/components/ui/Badge';
import { Card, SectionLabel, Divider } from '@/components/ui/Card';
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
  const [hc, setHc] = useState<HecmInputs>({ age: 62, value: 500000, mortgage: 0, payout: 'lump', rate: 6.5 });
  const set = (field: keyof HecmInputs, raw: string) => {
    const v = raw === '' ? 0 : parseFloat(raw);
    setHc((s) => ({ ...s, [field]: Number.isFinite(v) ? v : 0 }));
  };

  const res = computeHecm(hc.age, hc.value, hc.mortgage, hc.rate, hc.payout);

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
          <SectionLabel className="mb-4">BORROWER &amp; PROPERTY</SectionLabel>
          <div className="grid grid-cols-1 gap-x-[18px] gap-y-4 sm:grid-cols-2">
            <div>
              <Label>Youngest Borrower Age</Label>
              <NumberField value={hc.age} onChange={(v) => set('age', v)} ariaLabel="Youngest borrower age" />
            </div>
            <div>
              <Label>Home Value</Label>
              <NumberField prefix="$" value={hc.value} onChange={(v) => set('value', v)} ariaLabel="Home value" />
            </div>
            <div>
              <Label>Existing Mortgage Balance</Label>
              <NumberField prefix="$" value={hc.mortgage} onChange={(v) => set('mortgage', v)} ariaLabel="Existing mortgage balance" />
            </div>
            <div>
              <Label>Expected Rate (%)</Label>
              <NumberField suffix="%" value={hc.rate} onChange={(v) => set('rate', v)} ariaLabel="Expected rate" />
            </div>
          </div>

          <Divider className="my-6" />
          <SectionLabel className="mb-3.5">PAYOUT OPTION</SectionLabel>
          <PillGroup
            variant="teal"
            options={PAYOUTS}
            value={hc.payout}
            onChange={(v) => setHc((s) => ({ ...s, payout: v }))}
          />
        </Card>

        {/* RIGHT — result */}
        <div className="sticky top-5 flex flex-col gap-4">
          <Card variant="result" className="p-6">
            <div className="text-[12.5px] font-semibold text-[#8fb8c9]">Available to Borrower (est.)</div>
            <div className="num my-2 text-[42px] font-semibold tracking-[-1.5px] text-text-heading">
              {fmt(res.available)}
            </div>
            <div className="text-[13px] text-text-muted">
              Age {hc.age} · {(res.plf * 100).toFixed(1)}% PLF · {res.payoutLabel}
            </div>
            <div className="mt-5 flex flex-col gap-px">
              {[
                { label: 'Max Claim Amount', value: fmt(res.maxClaim), color: 'text-text-softer' },
                { label: 'Principal Limit Factor', value: `${(res.plf * 100).toFixed(1)}%`, color: 'text-text-softer' },
                { label: 'Gross Principal Limit', value: fmt(res.grossPrincipalLimit), color: 'text-text-primary' },
                { label: 'Less Existing Mortgage', value: `–${fmt(hc.mortgage)}`, color: 'text-warn-text' },
              ].map((row) => (
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
                PLFs are interpolated from HUD&apos;s published factor tables and capped at the FHA max claim amount (
                {fmt(HECM_MAX_CLAIM)}). Swap in the exact HUD PLF lookup for production.
              </StubNote>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
