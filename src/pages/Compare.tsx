import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, SectionLabel, Divider } from '@/components/ui/Card';
import { Badge, StubNote } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { PillGroup } from '@/components/ui/Pill';
import { NumberField } from '@/components/ui/NumberField';
import { Select } from '@/components/ui/Select';
import { Label, TextField } from '@/components/ui/TextField';
import { useScenarios, MAX_SCENARIOS } from '@/context/ScenariosContext';
import { useUI } from '@/context/UIContext';
import { closingCostAmount, computeScenario, defaultClosingCosts } from '@/lib/finance';
import { fmt, fmt2, pct, toNum } from '@/lib/format';
import type { ClosingCostItem, FeeBasis, LoanProgram, LoanType, TransactionType } from '@/types';

const FEE_BASES: { value: FeeBasis; label: string }[] = [
  { value: 'flat', label: 'Flat $' },
  { value: 'loan', label: '% of Loan' },
  { value: 'price', label: '% of Price' },
];

const newFeeId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `c${Date.now()}${Math.round(Math.random() * 1e6)}`;

const LOAN_TYPES: { value: LoanType; label: string }[] = [
  { value: 'conventional', label: 'Conventional' },
  { value: 'fha', label: 'FHA' },
  { value: 'va', label: 'VA' },
  { value: 'usda', label: 'USDA' },
  { value: 'arm', label: 'ARM' },
];
const PROGRAMS: { value: LoanProgram; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'homeready', label: 'HomeReady' },
  { value: 'homepossible', label: 'Home Possible' },
  { value: 'firsttime', label: 'First-Time Buyer' },
];
const TERMS = [
  { value: '30', label: '30 Years' },
  { value: '20', label: '20 Years' },
  { value: '15', label: '15 Years' },
  { value: '10', label: '10 Years' },
];
const CREDIT_BANDS = [
  { value: '800', label: '800–850 · Exceptional' },
  { value: '760', label: '760–799 · Excellent' },
  { value: '740', label: '740–759 · Very Good' },
  { value: '700', label: '700–739 · Good' },
  { value: '660', label: '660–699 · Fair' },
  { value: '620', label: '620–659 · Poor' },
  { value: '580', label: '580–619 · Very Poor' },
];

export default function Compare() {
  const { scenarios, active, current, select, patch, setField, addScenario, removeScenario, saveAll, saving, dirty } =
    useScenarios();
  const { openSettings } = useUI();

  const r = computeScenario(current);
  const priceLabel = current.transaction === 'refinance' ? 'Home Value' : 'Purchase Price';

  const exportScenarios = () => {
    const blob = new Blob([JSON.stringify(scenarios, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'loandr-scenarios.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const miApplies = r.mi.applies;

  // --- closing cost line-item management ---
  const feeItems: ClosingCostItem[] = current.closingCosts ?? [];
  const feeBaseLoan = r.baseLoan;
  const feePrice = current.homePrice || 0;
  const setFees = (next: ClosingCostItem[]) => patch({ closingCosts: next });
  const updateFee = (id: string, p: Partial<ClosingCostItem>) => setFees(feeItems.map((it) => (it.id === id ? { ...it, ...p } : it)));
  const addFee = () => setFees([...feeItems, { id: newFeeId(), label: 'Custom Fee', basis: 'flat', value: 0 }]);
  const removeFee = (id: string) => setFees(feeItems.filter((it) => it.id !== id));
  const resetFees = () => setFees(defaultClosingCosts());

  return (
    <div className="animate-lp-fade">
      <PageHeader
        title="Loan Comparison"
        subtitle="Model up to six scenarios and compare them side by side."
        actions={
          <>
            <Button variant="secondary" onClick={openSettings}>
              My Scenarios
            </Button>
            <Button variant="secondary" onClick={exportScenarios}>
              Export
            </Button>
            <Button variant="primary" onClick={() => saveAll()} disabled={saving}>
              {saving ? 'Saving…' : dirty ? 'Save *' : 'Save'}
            </Button>
          </>
        }
      />

      {/* Scenario tabs */}
      <div className="mb-[22px] flex items-center gap-2 border-b border-border">
        {scenarios.map((sc, i) => {
          const isActive = i === active;
          return (
            <div key={i} className="group relative flex items-center">
              <button
                onClick={() => select(i)}
                className="-mb-px cursor-pointer border-none bg-transparent px-[18px] py-[11px] text-[14px] font-semibold"
                style={{
                  borderBottom: `2px solid ${isActive ? '#2dd4bf' : 'transparent'}`,
                  color: isActive ? '#fff' : '#8ba0b6',
                }}
              >
                {sc.name}
              </button>
              {isActive && scenarios.length > 1 && (
                <button
                  onClick={() => removeScenario(i)}
                  title="Remove scenario"
                  className="mr-1 flex h-4 w-4 items-center justify-center rounded text-[14px] leading-none text-text-dim hover:text-danger"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
        {scenarios.length < MAX_SCENARIOS && (
          <button
            onClick={addScenario}
            title="Add scenario"
            className="mb-2 flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-[9px] border border-dashed border-[#2f4663] bg-transparent text-[20px] leading-none text-[#7d96ae] transition-colors hover:border-brand-teal hover:text-brand-teal"
          >
            +
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* LEFT — form */}
        <Card className="p-6">
          {/* transaction + borrowers */}
          <div className="mb-[22px] flex flex-wrap items-center justify-between gap-4">
            <SegmentedControl<TransactionType>
              options={[
                { value: 'purchase', label: 'Purchase' },
                { value: 'refinance', label: 'Refinance' },
              ]}
              value={current.transaction}
              onChange={(v) => patch({ transaction: v })}
            />
            <div className="flex items-center gap-2.5">
              <span className="text-[13px] font-medium text-text-muted">Borrowers</span>
              <SegmentedControl
                size="sm"
                options={[
                  { value: '1', label: '1' },
                  { value: '2', label: '2' },
                ]}
                value={current.borrowers}
                onChange={(v) => patch({ borrowers: v as '1' | '2' })}
              />
            </div>
          </div>

          <PillGroup
            className="mb-2.5"
            variant="teal"
            options={LOAN_TYPES}
            value={current.loanType}
            onChange={(v) => patch({ loanType: v })}
          />
          <PillGroup
            className="mb-6"
            variant="blue"
            options={PROGRAMS}
            value={current.program}
            onChange={(v) => patch({ program: v })}
          />

          <Divider className="mb-[22px]" />
          <SectionLabel className="mb-4">LOAN DETAILS</SectionLabel>

          <div className="grid grid-cols-1 gap-x-[18px] gap-y-4 sm:grid-cols-2">
            <div>
              <Label>{priceLabel}</Label>
              <NumberField prefix="$" value={current.homePrice} onChange={(v) => setField('homePrice', v)} ariaLabel={priceLabel} />
            </div>
            <div>
              <Label>Down Payment</Label>
              <div className="flex items-center gap-2">
                <NumberField prefix="$" value={current.downPayment} onChange={(v) => setField('downPayment', v)} ariaLabel="Down payment amount" />
                <div className="w-[92px] flex-shrink-0">
                  <NumberField suffix="%" value={current.downPct} onChange={(v) => setField('downPct', v)} ariaLabel="Down payment percent" />
                </div>
              </div>
            </div>
            <div>
              <Label>Interest Rate</Label>
              <NumberField suffix="%" value={current.rate} onChange={(v) => setField('rate', v)} ariaLabel="Interest rate" />
            </div>
            <div>
              <Label>Loan Amount (auto)</Label>
              <NumberField prefix="$" readOnly value={Math.round(r.baseLoan)} ariaLabel="Loan amount" />
            </div>
            <div>
              <Label>Loan Term</Label>
              <Select options={TERMS} value={current.term} onChange={(e) => patch({ term: e.target.value as typeof current.term })} />
            </div>
            <div>
              <Label>Credit Score</Label>
              <Select options={CREDIT_BANDS} value={current.credit} onChange={(e) => patch({ credit: e.target.value })} />
            </div>
          </div>

          <Divider className="my-6" />
          <div className="flex items-center justify-between">
            <SectionLabel>RATE BUYDOWN &amp; CREDITS</SectionLabel>
            <Badge tone="neutral">optional</Badge>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3.5">
            {([
              ['Lender Credit', 'lenderCredit'],
              ['Seller Credit', 'sellerCredit'],
              ['Other Credits', 'otherCredits'],
            ] as const).map(([label, key]) => (
              <div key={key}>
                <label className="mb-[7px] block text-[12.5px] font-semibold text-text-soft">{label}</label>
                <NumberField
                  size="sm"
                  prefix="$"
                  value={current[key]}
                  onChange={(v) => setField(key, v)}
                  ariaLabel={label}
                />
              </div>
            ))}
          </div>

          {/* CLOSING COSTS & FEES */}
          <Divider className="my-6" />
          <div className="flex items-center justify-between">
            <SectionLabel>CLOSING COSTS &amp; FEES</SectionLabel>
            <span className="num text-[13px] font-semibold text-text-softer">{fmt(r.closingCosts)}</span>
          </div>

          {feeItems.length === 0 ? (
            <div className="mt-3 rounded-[10px] border border-dashed border-border-input bg-input px-4 py-4 text-center">
              <div className="mb-2.5 text-[13px] text-text-muted">Using a 3% estimate. Itemize fees for an exact cash-to-close.</div>
              <Button variant="secondary" size="sm" onClick={resetFees}>
                Add standard fees
              </Button>
            </div>
          ) : (
            <>
              <div className="mt-3 hidden grid-cols-[1fr_104px_96px_84px_24px] gap-2 px-1 text-[11px] font-bold tracking-[0.4px] text-text-dim sm:grid">
                <span>FEE</span>
                <span>BASIS</span>
                <span>AMOUNT</span>
                <span className="text-right">TOTAL</span>
                <span />
              </div>
              <div className="mt-1.5 flex flex-col gap-2">
                {feeItems.map((it) => (
                  <div key={it.id} className="grid grid-cols-[1fr_104px_96px_84px_24px] items-center gap-2">
                    <TextField
                      value={it.label}
                      onChange={(e) => updateFee(it.id, { label: e.target.value })}
                      className="!h-[38px] !rounded-[8px] !text-[13px]"
                      aria-label="Fee name"
                    />
                    <Select
                      value={it.basis}
                      onChange={(e) => updateFee(it.id, { basis: e.target.value as FeeBasis })}
                      options={FEE_BASES}
                      className="!h-[38px] !rounded-[8px] !px-2.5 !text-[12.5px]"
                    />
                    <NumberField
                      size="sm"
                      prefix={it.basis === 'flat' ? '$' : undefined}
                      suffix={it.basis === 'flat' ? undefined : '%'}
                      value={it.value}
                      onChange={(v) => updateFee(it.id, { value: toNum(v) })}
                      className="!h-[38px] !rounded-[8px]"
                      ariaLabel={`${it.label} amount`}
                    />
                    <span className="num text-right text-[13px] text-text-softer">{fmt(closingCostAmount(it, feeBaseLoan, feePrice))}</span>
                    <button
                      onClick={() => removeFee(it.id)}
                      title="Remove fee"
                      className="flex h-6 w-6 items-center justify-center rounded text-[16px] leading-none text-text-dim transition-colors hover:text-danger"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={addFee}>
                    + Add fee
                  </Button>
                  <Button variant="ghost" size="sm" onClick={resetFees}>
                    Reset to standard
                  </Button>
                </div>
                <div className="text-[12.5px] text-text-muted">
                  Total <span className="num font-semibold text-text-softer">{fmt(r.closingCosts)}</span>
                </div>
              </div>
            </>
          )}
        </Card>

        {/* RIGHT — results */}
        <div className="sticky top-5 flex flex-col gap-4">
          <Card variant="result" className="relative overflow-hidden p-6">
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-[140px] w-[140px]"
              style={{ background: 'radial-gradient(circle,rgba(45,212,191,.18),transparent 70%)' }}
            />
            <div className="text-[12.5px] font-semibold tracking-[0.3px] text-[#8fb8c9]">
              {r.typeLabel} · Estimated Monthly Payment
            </div>
            <div className="num my-2 text-[46px] font-semibold leading-none tracking-[-1.5px] text-text-heading">
              {fmt2(r.totalMonthly)}
            </div>
            <div className="text-[13px] text-text-muted">{r.subline}</div>
            <div className="mt-5 flex flex-col gap-px">
              {[
                { label: 'Principal & Interest', value: fmt2(r.pi), color: 'text-text-primary' },
                { label: 'Property Taxes (est.)', value: fmt2(r.taxes), color: 'text-text-softer' },
                { label: 'Homeowners Insurance (est.)', value: fmt2(r.insurance), color: 'text-text-softer' },
                miApplies
                  ? { label: `${r.mi.label} (est.)`, value: fmt2(r.mi.monthly), color: 'text-warn-text' }
                  : { label: 'Mortgage Insurance', value: 'None', color: 'text-[#5f9e7a]' },
                { label: 'APR (est.)', value: pct(r.apr, 3), color: 'text-text-softer' },
                { label: 'Total Interest (life)', value: fmt(r.totalInterest), color: 'text-text-softer' },
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
          </Card>

          <Card className="p-5">
            <div className="mb-3.5 flex items-center justify-between">
              <span className="text-[13px] font-bold text-text-softer">Cash to Close</span>
              <span className="num text-[18px] font-semibold text-brand-teal">{fmt(r.cashToClose)}</span>
            </div>
            {[
              { label: 'Down Payment', value: fmt(current.downPayment || 0) },
              { label: r.closingItemized ? 'Closing Costs' : 'Est. Closing Costs (3%)', value: fmt(r.closingCosts) },
              { label: 'Credits Applied', value: `–${fmt(r.creditsApplied)}` },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-[7px] text-[13px]">
                <span className="text-text-muted">{row.label}</span>
                <span className="num text-text-softer">{row.value}</span>
              </div>
            ))}
            <div className="mt-3.5">
              <StubNote>
                MIP/PMI, APR &amp; total-interest are computed from standard national rate cards — confirm exact lender
                factors and fees before quoting a borrower.
              </StubNote>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
