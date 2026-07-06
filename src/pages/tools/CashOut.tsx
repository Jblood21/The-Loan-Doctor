import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { cashOutConsolidation } from '@/lib/finance';
import { fmt, fmt2 } from '@/lib/format';
import { CalcField, Headline, ResultPanel, Row, type CalcProps } from './_shared';

export default function CashOut({ open, onClose }: CalcProps) {
  const [homeValue, setHomeValue] = useState(500000);
  const [curBalance, setCurBalance] = useState(280000);
  const [curPayment, setCurPayment] = useState(1750);
  const [debtBalance, setDebtBalance] = useState(35000);
  const [debtPayment, setDebtPayment] = useState(850);
  const [extraCash, setExtraCash] = useState(0);
  const [newRate, setNewRate] = useState(6.5);
  const [newTerm, setNewTerm] = useState(30);

  const set = (fn: (v: number) => void) => (v: string) => fn(v === '' ? 0 : parseFloat(v) || 0);

  const r = cashOutConsolidation({
    homeValue,
    currentBalance: curBalance,
    currentPayment: curPayment,
    debtBalance,
    debtPayment,
    extraCash,
    newRate,
    newTermYears: newTerm,
  });
  const highLtv = r.ltv > 80;

  return (
    <Modal open={open} onClose={onClose} title="Cash-Out / Debt Consolidation" subtitle="Roll high-rate debt into the mortgage and compare the monthly outflow." width={760}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1.15fr_1fr]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <CalcField label="Home Value" prefix="$" value={homeValue} onChange={set(setHomeValue)} />
          <CalcField label="Current Balance" prefix="$" value={curBalance} onChange={set(setCurBalance)} />
          <CalcField label="Current Payment (P&I)" prefix="$" value={curPayment} onChange={set(setCurPayment)} />
          <CalcField label="Other Debt Balance" prefix="$" value={debtBalance} onChange={set(setDebtBalance)} />
          <CalcField label="Other Debt Payment" prefix="$" value={debtPayment} onChange={set(setDebtPayment)} />
          <CalcField label="Extra Cash Out" prefix="$" value={extraCash} onChange={set(setExtraCash)} />
          <CalcField label="New Rate" suffix="%" value={newRate} onChange={set(setNewRate)} />
          <CalcField label="New Term (yrs)" value={newTerm} onChange={set(setNewTerm)} />
        </div>
        <ResultPanel>
          <Headline
            label={r.monthlySavings >= 0 ? 'Lower Monthly Outflow' : 'Higher Monthly Outflow'}
            value={fmt2(Math.abs(r.monthlySavings))}
            sub={r.monthlySavings >= 0 ? 'saved vs. paying everything separately' : 'more per month than today'}
          />
          <Row label="New Loan Amount" value={fmt(r.newLoanAmount)} />
          <Row label="New LTV" value={`${r.ltv.toFixed(1)}%`} color={highLtv ? 'text-warn-text' : 'text-text-softer'} />
          <Row label="New Mortgage Payment" value={fmt2(r.newPayment)} />
          <Row label="Today: Mortgage + Debts" value={fmt2(r.currentTotalMonthly)} />
          <Row
            label="Monthly Difference"
            value={`${r.monthlySavings >= 0 ? '−' : '+'} ${fmt2(Math.abs(r.monthlySavings))}`}
            color={r.monthlySavings >= 0 ? 'text-brand-teal' : 'text-danger'}
          />
          {r.cashOut > 0 && <Row label="Cash to Borrower" value={fmt(r.cashOut)} color="text-good" />}
        </ResultPanel>
      </div>
      <p className="mt-4 text-[12px] leading-[1.5] text-text-dim2">
        {highLtv
          ? 'Heads up: a cash-out over 80% LTV usually adds mortgage insurance and may change eligibility.'
          : 'Consolidating spreads short-term debt over the loan term — lower monthly, but confirm total interest with the borrower.'}
      </p>
    </Modal>
  );
}
