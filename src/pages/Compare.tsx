import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, SectionLabel, Divider } from '@/components/ui/Card';
import { Badge, StubNote } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { PillGroup } from '@/components/ui/Pill';
import { NumberField } from '@/components/ui/NumberField';
import { Select } from '@/components/ui/Select';
import { Label, TextField } from '@/components/ui/TextField';
import { ClosingCostsEditor, cloneFees } from '@/components/ClosingCostsEditor';
import { useScenarios, MAX_SCENARIOS } from '@/context/ScenariosContext';
import { useSettings } from '@/context/SettingsContext';
import { useUI } from '@/context/UIContext';
import { computeScenario, defaultClosingCosts } from '@/lib/finance';
import { buildComparisonModel } from '@/lib/comparisonModel';
import { RATES_AS_OF } from '@/lib/loanProgramRules';
import { DonutChart, PAYMENT_COLORS } from '@/components/charts/DonutChart';
import { api, ApiError } from '@/lib/api';
import { fmt, fmt2, pct } from '@/lib/format';
import type { ClosingCostItem, LoanProgram, LoanType, TransactionType } from '@/types';

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
/** "$450,000" → "$450K" when round to the thousand, else the full currency string. */
function compactPrice(n: number): string {
  const v = Math.round(n || 0);
  return v >= 1000 && v % 1000 === 0 ? `$${v / 1000}K` : fmt(v);
}

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
  const { settings, save } = useSettings();
  const { openSettings } = useUI();
  const [savedDefault, setSavedDefault] = useState(false);
  const [borrowerName, setBorrowerName] = useState('');
  // Property address has three states: a real address, "TBD", or omitted entirely.
  const [addressMode, setAddressMode] = useState<'available' | 'tbd' | 'none'>('none');
  const [propertyAddress, setPropertyAddress] = useState('');
  const resolvedAddress = addressMode === 'available' ? propertyAddress.trim() : addressMode === 'tbd' ? 'TBD' : '';

  // Dynamic comparison model: which rows/notes are relevant to the actual scenarios.
  const comparisonModel = useMemo(() => buildComparisonModel(scenarios), [scenarios]);

  const r = computeScenario(current);
  const priceLabel = current.transaction === 'refinance' ? 'Home Value' : 'Purchase Price';

  // Taxes & insurance: auto (% of value) by default, or a manual $/mo the user types.
  // Toggling to manual seeds the field with the current auto estimate so nothing jumps.
  const taxManual = current.taxMonthly != null;
  const insManual = current.insuranceMonthly != null;
  const setTaxManual = (on: boolean) => patch({ taxMonthly: on ? Math.round(r.taxes * 100) / 100 : undefined });
  const setInsManual = (on: boolean) => patch({ insuranceMonthly: on ? Math.round(r.insurance * 100) / 100 : undefined });

  const [busy, setBusy] = useState<'pdf' | 'share' | null>(null);
  const [shareMsg, setShareMsg] = useState('');
  // AI assistant state.
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

  // Build the side-by-side comparison from every scenario. Returns both the legacy
  // names/metrics matrix (used by the shareable quote) and a structured payload the
  // redesigned "Home Financing Comparison" PDF renders.
  const buildComparison = () => {
    const results = scenarios.map((s) => ({ s, c: computeScenario(s) }));
    const names = results.map(({ s }) => s.name);
    const bestIndex = results.reduce((best, { c }, i, arr) => (c.totalMonthly < arr[best].c.totalMonthly ? i : best), 0);
    const rows: { label: string; get: (x: { s: (typeof results)[0]['s']; c: (typeof results)[0]['c'] }) => string }[] = [
      { label: 'Loan Type', get: ({ c }) => c.typeLabel },
      { label: 'Price / Value', get: ({ s }) => fmt(s.homePrice || 0) },
      { label: 'Loan Amount', get: ({ c }) => fmt(c.baseLoan) },
      { label: 'Down Payment', get: ({ s }) => fmt(s.downPayment || 0) },
      { label: 'Rate', get: ({ s }) => `${s.rate || 0}%` },
      { label: 'Term', get: ({ s }) => `${s.term} yr` },
      { label: 'Principal & Interest', get: ({ c }) => fmt2(c.pi) },
      { label: 'Property Taxes', get: ({ c }) => fmt2(c.taxes) },
      { label: 'Homeowners Insurance', get: ({ c }) => fmt2(c.insurance) },
      { label: 'HOA', get: ({ c }) => fmt2(c.hoa) },
      { label: 'Mortgage Insurance', get: ({ c }) => (c.mi.applies ? fmt2(c.mi.monthly) : 'None') },
      { label: 'Total Monthly', get: ({ c }) => fmt2(c.totalMonthly) },
      { label: 'APR (est.)', get: ({ c }) => pct(c.apr, 3) },
      { label: 'Closing Costs', get: ({ c }) => fmt(c.closingCosts) },
      { label: 'Cash to Close', get: ({ c }) => fmt(c.cashToClose) },
    ];
    const metrics = rows.map((row) => ({ label: row.label, values: results.map(row.get) }));
    const lender = {
      name: settings.lenderName || settings.company,
      phone: settings.lenderPhone || settings.phone,
      email: settings.email,
      nmls: settings.lenderNmls || settings.nmls,
      website: settings.website,
      address: settings.lenderAddress,
      officer: settings.name,
      officerNmls: settings.nmls,
    };

    // Structured, per-column data for the redesigned comparison PDF.
    const downPctOf = (s: (typeof results)[0]['s']) =>
      Math.round(s.homePrice > 0 ? ((s.downPayment || 0) / s.homePrice) * 100 : s.downPct || 0);

    // Detect whether the scenarios are homogeneous (a price sweep of one product) or
    // heterogeneous (e.g. Conventional vs FHA). The header + column labels adapt so a
    // mixed comparison reads correctly instead of pretending one program/rate applies.
    const first = results[0];
    const cents = (n: number) => Math.round((n || 0) * 100);
    const sameType = results.every(({ s }) => s.loanType === first.s.loanType && s.term === first.s.term);
    const sameRate = results.every(({ s }) => (s.rate || 0) === (first.s.rate || 0));
    const sameDown = results.every(({ s }) => downPctOf(s) === downPctOf(first.s));
    const sameTax = results.every(({ c }) => cents(c.taxes) === cents(first.c.taxes));
    const sameIns = results.every(({ c }) => cents(c.insurance) === cents(first.c.insurance));
    const sameHoa = results.every(({ c }) => cents(c.hoa) === cents(first.c.hoa));
    const mixed = !sameType;

    const columns = results.map(({ s, c }) => {
      const price = compactPrice(s.homePrice || 0);
      const dn = downPctOf(s);
      return {
        priceLabel: price,
        downLabel: `${dn}% DOWN`,
        // Column header (big line + small line) — identifies each column by loan TYPE
        // when types differ, else by price (the reference's price-sweep look).
        head1: mixed ? c.typeLabel : price,
        head2: mixed ? `${price} · ${dn}% down` : `${dn}% DOWN`,
        cardLabel: mixed ? `${c.typeLabel} · ${price}` : `${price} · ${dn}% DOWN`,
        downPayment: fmt(s.downPayment || 0),
        loanAmount: fmt(c.baseLoan),
        rate: `${s.rate || 0}%`,
        apr: pct(c.apr, 3),
        pi: fmt2(c.pi),
        mi: c.mi.applies ? fmt2(c.mi.monthly) : '—',
        taxes: fmt2(c.taxes),
        insurance: fmt2(c.insurance),
        hoa: c.hoa > 0 ? fmt2(c.hoa) : 'NA',
        totalMonthly: fmt2(c.totalMonthly),
        closing: fmt2(c.closingCosts),
        credits: c.creditsApplied > 0 ? `–${fmt2(c.creditsApplied)}` : fmt2(0),
        netClosing: fmt2(Math.max(0, c.closingCosts - c.creditsApplied)),
        cashToClose: fmt2(c.cashToClose),
      };
    });

    // Loan Assumptions strip: show a shared value, or "Varies" when the scenarios differ.
    const assumptions = {
      purchaseOptions: results.map(({ s }) => compactPrice(s.homePrice || 0)).join(', '),
      downPayment: sameDown ? `${downPctOf(current)}%` : 'Varies',
      insurance: sameIns ? `${fmt2(r.insurance)} / mo` : 'Varies',
      taxes: sameTax ? `${fmt2(r.taxes)} / mo` : 'Varies',
      hoa: sameHoa ? (r.hoa > 0 ? `${fmt2(r.hoa)} / mo` : 'NA') : 'Varies',
    };
    // Header program + rate collapse to a single value only when every scenario shares it.
    const programLabel = sameType
      ? `${current.term}-Year ${current.loanType === 'arm' ? 'ARM' : 'Fixed'} ${r.typeLabel}`
      : 'Loan Scenario Comparison';
    const subLine = sameType
      ? `FICO ${current.credit}  ·  ${current.transaction === 'refinance' ? 'Refinance' : 'Purchase'}`
      : `${results.length} scenarios compared side by side`;

    // Plain-language insight lines (computed here where fmt lives).
    const baseTotal = results[0]?.c.totalMonthly ?? 0;
    const paymentDiff = results
      .slice(1)
      .map(({ s, c }) => {
        const d = c.totalMonthly - baseTotal;
        if (Math.abs(d) < 0.005) return `${compactPrice(s.homePrice || 0)} matches ${compactPrice(results[0].s.homePrice || 0)}.`;
        return `${compactPrice(s.homePrice || 0)} is ${fmt2(Math.abs(d))}/mo ${d > 0 ? 'more' : 'less'} than ${compactPrice(results[0].s.homePrice || 0)}.`;
      });
    const cheapest = results[bestIndex];
    const keyTakeaway =
      results.length > 1
        ? `Lowest payment: ${compactPrice(cheapest.s.homePrice || 0)} at ${fmt2(cheapest.c.totalMonthly)}/mo.`
        : '';

    return {
      names,
      metrics,
      bestIndex,
      lender,
      borrowerName,
      programLabel,
      subLine,
      // Empty when rates differ → the PDF hides the single "RATE" box.
      rate: sameRate ? `${current.rate || 0}%` : '',
      assumptions,
      columns,
      insights: { paymentDiff, keyTakeaway },
      // Property & Borrower info + the dynamic comparison model (rows/notes chosen
      // by the actual scenarios). Additive — the current PDF ignores these; the
      // dynamic renderer (a later phase) consumes them.
      propertyAddress: resolvedAddress,
      model: comparisonModel,
    };
  };

  const exportComparisonPdf = async () => {
    setBusy('pdf');
    setShareMsg('');
    try {
      const blob = await api.comparePdf({ title: 'Home Financing Comparison', ...buildComparison(), logo: settings.logoDataUrl || undefined });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `home-financing-comparison${borrowerName ? '-' + borrowerName.split(' ').pop() : ''}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setShareMsg('Could not generate the PDF. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const shareQuote = async () => {
    setBusy('share');
    setShareMsg('');
    try {
      const { names, metrics, bestIndex, lender } = buildComparison();
      const { url } = await api.createShare({ title: 'Loan Comparison', names, metrics, bestIndex, lender });
      const copied = await navigator.clipboard.writeText(url).then(() => true).catch(() => false);
      setShareMsg(copied ? 'Share link copied to clipboard!' : url);
    } catch {
      setShareMsg('Could not create a share link. Save your scenarios and try again.');
    } finally {
      setBusy(null);
    }
  };

  // Compact text summary of every scenario, sent to the AI as context.
  const buildAiContext = () => {
    const lines = scenarios.map((s, i) => {
      const c = computeScenario(s);
      const isRefi = s.transaction === 'refinance';
      const dn = Math.round(s.homePrice > 0 ? ((s.downPayment || 0) / s.homePrice) * 100 : s.downPct || 0);
      const mi = c.mi.applies ? `${c.mi.label} ${fmt2(c.mi.monthly)}` : 'no MI';
      return (
        `Scenario "${s.name || `Scenario ${i + 1}`}": ${c.typeLabel} ${isRefi ? 'refinance' : 'purchase'}, ` +
        `${isRefi ? 'home value' : 'price'} ${fmt(s.homePrice || 0)}, loan ${fmt(c.baseLoan)}, ${dn}% down (${fmt(s.downPayment || 0)}), ` +
        `rate ${s.rate || 0}%, ${s.term}-yr. Monthly — P&I ${fmt2(c.pi)}, taxes ${fmt2(c.taxes)}, insurance ${fmt2(c.insurance)}` +
        `${c.hoa > 0 ? `, HOA ${fmt2(c.hoa)}` : ''}, ${mi}, total ${fmt2(c.totalMonthly)}/mo. APR ${pct(c.apr, 3)}. ` +
        `Cash to close ${fmt(c.cashToClose)}. Total interest over the loan ${fmt(c.totalInterest)}.`
      );
    });
    return `${borrowerName ? `Borrower: ${borrowerName}.\n` : ''}${lines.join('\n')}`;
  };

  const askAi = async (q?: string) => {
    const question = (q ?? aiQuestion).trim();
    if (!question || aiBusy) return;
    if (q) setAiQuestion(q);
    setAiBusy(true);
    setAiError('');
    setAiAnswer('');
    try {
      const { answer } = await api.aiCompare(question, buildAiContext());
      setAiAnswer(answer);
    } catch (err) {
      setAiError(err instanceof ApiError ? err.message : 'The assistant could not answer right now. Please try again.');
    } finally {
      setAiBusy(false);
    }
  };

  const miApplies = r.mi.applies;

  // --- closing cost line items (per scenario) ---
  const feeItems: ClosingCostItem[] = current.closingCosts ?? [];
  const feeBaseLoan = r.baseLoan;
  const feePrice = current.homePrice || 0;
  const myDefaults = settings.feeDefaults?.length ? settings.feeDefaults : defaultClosingCosts();
  const setFees = (next: ClosingCostItem[]) => patch({ closingCosts: next });
  const resetFees = () => setFees(cloneFees(myDefaults));
  const saveFeesAsDefault = () => {
    save({ feeDefaults: cloneFees(feeItems) });
    setSavedDefault(true);
    window.setTimeout(() => setSavedDefault(false), 1800);
  };

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
            <Button variant="secondary" onClick={shareQuote} disabled={busy !== null}>
              {busy === 'share' ? 'Sharing…' : 'Share'}
            </Button>
            <Button variant="secondary" onClick={exportComparisonPdf} disabled={busy !== null}>
              {busy === 'pdf' ? 'Building…' : 'Export PDF'}
            </Button>
            <Button variant="primary" onClick={() => saveAll()} disabled={saving}>
              {saving ? 'Saving…' : dirty ? 'Save *' : 'Save'}
            </Button>
          </>
        }
      />

      {shareMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-[11px] border border-[rgba(45,212,191,0.28)] bg-[rgba(45,212,191,0.08)] px-4 py-2.5 text-[13px] text-brand-teal">
          <span className="break-all">{shareMsg}</span>
        </div>
      )}

      {/* Scenario tabs — scroll horizontally on narrow screens instead of wrapping */}
      <div className="mb-[22px] flex items-center gap-2 overflow-x-auto border-b border-border">
        {scenarios.map((sc, i) => {
          const isActive = i === active;
          return (
            <div key={i} className="group relative flex flex-shrink-0 items-center">
              <button
                onClick={() => select(i)}
                className="-mb-px cursor-pointer whitespace-nowrap border-none bg-transparent px-[18px] py-[11px] text-[14px] font-semibold"
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
          {/* Property & Borrower Information — prints on the comparison PDF */}
          <div className="mb-[22px]">
            <Label>Prepared For (Borrower)</Label>
            <TextField
              placeholder="Borrower's name (appears on the PDF)"
              value={borrowerName}
              onChange={(e) => setBorrowerName(e.target.value)}
            />
            <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
              <span className="text-[13px] font-medium text-text-muted">Property Address</span>
              <SegmentedControl
                size="sm"
                options={[
                  { value: 'available', label: 'Address' },
                  { value: 'tbd', label: 'TBD' },
                  { value: 'none', label: 'None' },
                ]}
                value={addressMode}
                onChange={(v) => setAddressMode(v as 'available' | 'tbd' | 'none')}
              />
            </div>
            {addressMode === 'available' && (
              <div className="mt-2.5">
                <TextField
                  placeholder="123 Main St, City, ST 00000"
                  value={propertyAddress}
                  onChange={(e) => setPropertyAddress(e.target.value)}
                />
              </div>
            )}
            {addressMode === 'tbd' && (
              <div className="mt-2 text-[11.5px] text-text-dim">The report will show “TBD” for the property address.</div>
            )}
          </div>

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
            className={current.loanType === 'va' ? 'mb-3' : 'mb-6'}
            variant="blue"
            options={PROGRAMS}
            value={current.program}
            onChange={(v) => patch({ program: v })}
          />

          {current.loanType === 'va' && (
            <div className="mb-6 rounded-[12px] border border-[rgba(129,140,248,0.28)] bg-[rgba(129,140,248,0.06)] p-4">
              <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.5px] text-[#818cf8]">VA Options</div>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-[13px] font-medium text-text-muted">Funding Fee</span>
                  <SegmentedControl
                    size="sm"
                    options={[
                      { value: 'no', label: 'Standard' },
                      { value: 'yes', label: 'Exempt' },
                    ]}
                    value={current.vaFundingFeeExempt ? 'yes' : 'no'}
                    onChange={(v) => patch({ vaFundingFeeExempt: v === 'yes' })}
                  />
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-[13px] font-medium text-text-muted">VA Use</span>
                  <SegmentedControl
                    size="sm"
                    options={[
                      { value: 'first', label: 'First' },
                      { value: 'subsequent', label: 'Subsequent' },
                    ]}
                    value={current.vaSubsequentUse ? 'subsequent' : 'first'}
                    onChange={(v) => patch({ vaSubsequentUse: v === 'subsequent' })}
                  />
                </div>
              </div>
              <div className="mt-3 text-[11.5px] leading-[1.5] text-text-dim">
                {current.vaFundingFeeExempt
                  ? 'Funding fee waived — exempt borrowers (e.g. VA disability compensation) pay no funding fee.'
                  : 'Funding fee applies. Exempt for veterans with VA disability compensation, Purple Heart recipients on active duty, and qualifying surviving spouses.'}
              </div>
            </div>
          )}

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

          {/* TAXES, INSURANCE & HOA — auto estimates, or toggle to a manual $/mo */}
          <Divider className="my-6" />
          <SectionLabel className="mb-4">TAXES, INSURANCE &amp; HOA</SectionLabel>
          <div className="flex flex-col gap-4">
            {([
              { key: 'tax', label: 'Property Taxes', manual: taxManual, setManual: setTaxManual, autoVal: r.taxes, field: 'taxMonthly', stored: current.taxMonthly, hint: 'Auto · 1.25%/yr of value' },
              { key: 'ins', label: 'Homeowners Insurance', manual: insManual, setManual: setInsManual, autoVal: r.insurance, field: 'insuranceMonthly', stored: current.insuranceMonthly, hint: 'Auto · 0.35%/yr of value' },
            ] as const).map((row) => (
              <div key={row.key} className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-[140px]">
                  <div className="text-[13px] font-semibold text-text-soft">{row.label}</div>
                  <div className="text-[11.5px] text-text-dim">{row.manual ? 'Manual amount' : row.hint}</div>
                </div>
                <div className="flex items-center gap-2">
                  <SegmentedControl
                    size="sm"
                    options={[
                      { value: 'auto', label: 'Auto' },
                      { value: 'manual', label: 'Manual' },
                    ]}
                    value={row.manual ? 'manual' : 'auto'}
                    onChange={(v) => row.setManual(v === 'manual')}
                  />
                  <div className="flex w-[132px] items-center gap-1">
                    <NumberField
                      size="sm"
                      prefix="$"
                      readOnly={!row.manual}
                      value={row.manual ? row.stored ?? 0 : Math.round(row.autoVal * 100) / 100}
                      onChange={row.manual ? (v) => patch({ [row.field]: v === '' ? 0 : parseFloat(v) }) : undefined}
                      ariaLabel={`${row.label} per month`}
                    />
                    <span className="text-[11.5px] text-text-dim">/mo</span>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-[140px]">
                <div className="text-[13px] font-semibold text-text-soft">HOA Dues</div>
                <div className="text-[11.5px] text-text-dim">Monthly, if any</div>
              </div>
              <div className="flex w-[132px] items-center gap-1 sm:mr-[76px]">
                <NumberField
                  size="sm"
                  prefix="$"
                  value={current.hoaMonthly ?? 0}
                  onChange={(v) => patch({ hoaMonthly: v === '' ? 0 : parseFloat(v) })}
                  ariaLabel="HOA dues per month"
                />
                <span className="text-[11.5px] text-text-dim">/mo</span>
              </div>
            </div>
          </div>

          <Divider className="my-6" />
          <div className="flex items-center justify-between">
            <SectionLabel>RATE BUYDOWN &amp; CREDITS</SectionLabel>
            <Badge tone="neutral">optional</Badge>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
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
            <div className="flex items-center gap-3">
              {feeItems.length > 0 && (
                <button
                  onClick={saveFeesAsDefault}
                  className="cursor-pointer border-none bg-transparent text-[12px] font-semibold text-brand-blue-light underline"
                >
                  {savedDefault ? 'Saved as default ✓' : 'Set as my default'}
                </button>
              )}
              <span className="num text-[13px] font-semibold text-text-softer">{fmt(r.closingCosts)}</span>
            </div>
          </div>

          <ClosingCostsEditor
            items={feeItems}
            onChange={setFees}
            loan={feeBaseLoan}
            price={feePrice}
            onReset={resetFees}
            resetLabel="Reset to my defaults"
            emptyHint="Using a 3% estimate. Itemize fees for an exact cash-to-close."
            enableTitleSchedule
            transaction={current.transaction}
          />
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
                { label: `Property Taxes${taxManual ? '' : ' (est.)'}`, value: fmt2(r.taxes), color: 'text-text-softer' },
                { label: `Homeowners Insurance${insManual ? '' : ' (est.)'}`, value: fmt2(r.insurance), color: 'text-text-softer' },
                ...(r.hoa > 0 ? [{ label: 'HOA Dues', value: fmt2(r.hoa), color: 'text-text-softer' }] : []),
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
            <div className="mb-3.5 text-[13px] font-bold text-text-softer">Monthly Payment Breakdown</div>
            <DonutChart
              segments={[
                { label: 'Principal & Interest', value: r.pi, color: PAYMENT_COLORS[0] },
                { label: 'Property Taxes', value: r.taxes, color: PAYMENT_COLORS[1] },
                { label: 'Homeowners Insurance', value: r.insurance, color: PAYMENT_COLORS[2] },
                ...(miApplies ? [{ label: r.mi.label, value: r.mi.monthly, color: PAYMENT_COLORS[3] }] : []),
                ...(r.hoa > 0 ? [{ label: 'HOA', value: r.hoa, color: PAYMENT_COLORS[4] }] : []),
              ]}
              centerValue={fmt(r.totalMonthly)}
              centerLabel="/mo"
              formatValue={fmt}
            />
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

      {/* Dynamic program notes — generated from the loan programs actually compared */}
      {comparisonModel.notes.length > 0 && (
        <Card className="mt-6 p-6">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <SectionLabel>COMPARISON NOTES</SectionLabel>
            <span className="text-[12px] text-text-dim">
              {comparisonModel.programLabels.join(' · ')}
            </span>
          </div>
          <div className="mb-3.5 text-[12.5px] text-text-muted">
            These notes appear automatically based on the programs you’re comparing — they’ll print on the report.
          </div>
          <ul className="flex flex-col gap-2">
            {comparisonModel.notes.map((note, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-[1.55] text-text-soft">
                <span className="mt-[2px] text-brand-teal">•</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3.5">
            <StubNote>
              Estimates only — not a Loan Estimate or commitment to lend. Program figures ({RATES_AS_OF}) can change;
              confirm exact factors and fees before quoting a borrower.
            </StubNote>
          </div>
        </Card>
      )}

      {/* AI assistant — sandboxed to the scenarios above */}
      <Card className="mt-6 p-6">
        <div className="mb-1 flex items-center gap-2">
          <SectionLabel>ASK AI ABOUT THESE SCENARIOS</SectionLabel>
          <Badge tone="teal">Beta</Badge>
        </div>
        <div className="mb-3.5 text-[12.5px] text-text-muted">
          Ask which option is best, or anything about the loans above. The assistant only sees these scenarios — nothing else.
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <TextField
            placeholder="e.g. Which scenario has the lowest total cost?"
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') askAi();
            }}
            aria-label="Ask the AI assistant about these scenarios"
          />
          <Button variant="primary" className="!px-6 sm:w-auto" disabled={aiBusy || !aiQuestion.trim()} onClick={() => askAi()}>
            {aiBusy ? 'Thinking…' : 'Ask'}
          </Button>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {['Which option is cheapest overall?', 'Explain the APR differences', 'Which has the lowest cash to close?', 'Pros and cons of each'].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => askAi(q)}
              disabled={aiBusy}
              className="cursor-pointer rounded-full border border-border-seg bg-input px-2.5 py-1 text-[11.5px] text-text-soft transition-colors hover:border-brand-teal hover:text-brand-teal disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        {aiError && (
          <div className="mt-3.5 rounded-[10px] border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.1)] px-3.5 py-2.5 text-[13px] text-danger">
            {aiError}
          </div>
        )}
        {aiAnswer && !aiError && (
          <div className="mt-3.5 whitespace-pre-wrap rounded-[12px] border border-[rgba(45,212,191,0.22)] bg-[rgba(45,212,191,0.06)] px-4 py-3.5 text-[13.5px] leading-[1.6] text-text-softer">
            {aiAnswer}
          </div>
        )}
        <div className="mt-3 text-[11px] text-text-dim">AI-generated — estimates only, not financial advice. Verify important figures before quoting a borrower.</div>
      </Card>
    </div>
  );
}
