import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { amortizationSchedule, monthlyPayment } from '@/lib/finance';
import { fmt, fmt2 } from '@/lib/format';
import { CalcField, CalcSelect, Headline, ResultPanel, Row, TERM_OPTIONS, type CalcProps } from './_shared';

export default function ExtraPayment({ open, onClose }: CalcProps) {
  const [loan, setLoan] = useState(320000);
  const [rate, setRate] = useState(6.5);
  const [term, setTerm] = useState('30');
  const [extra, setExtra] = useState(200);

  const set = (fn: (v: number) => void) => (v: string) => fn(v === '' ? 0 : parseFloat(v) || 0);
  const years = parseInt(term, 10) || 30;

  const base = amortizationSchedule(loan, rate, years, 0);
  const withExtra = amortizationSchedule(loan, rate, years, extra);
  const baseInterest = base.length ? base[base.length - 1].cumulativeInterest : 0;
  const extraInterest = withExtra.length ? withExtra[withExtra.length - 1].cumulativeInterest : 0;
  const monthsSaved = base.length - withExtra.length;
  const pi = monthlyPayment(loan, rate, years);

  return (
    <Modal open={open} onClose={onClose} title="Extra Payment" subtitle="Interest saved and payoff time with extra principal." width={720}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1.1fr_1fr]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <CalcField label="Loan Amount" prefix="$" value={loan} onChange={set(setLoan)} />
          <CalcField label="Interest Rate" suffix="%" value={rate} onChange={set(setRate)} />
          <CalcSelect label="Loan Term" value={term} onChange={setTerm} options={TERM_OPTIONS} />
          <CalcField label="Extra Monthly Principal" prefix="$" value={extra} onChange={set(setExtra)} />
        </div>
        <ResultPanel>
          <Headline
            label="Interest Saved"
            value={fmt(Math.max(0, baseInterest - extraInterest))}
            sub={`Pay off ${Math.floor(monthsSaved / 12)} yr ${monthsSaved % 12} mo sooner`}
          />
          <Row label="Base Monthly P&I" value={fmt2(pi)} />
          <Row label="With Extra Payment" value={fmt2(pi + extra)} color="text-brand-teal" />
          <Row label="New Payoff" value={`${Math.floor(withExtra.length / 12)} yr ${withExtra.length % 12} mo`} />
          <Row label="Total Interest (base)" value={fmt(baseInterest)} />
          <Row label="Total Interest (with extra)" value={fmt(extraInterest)} color="text-good" />
        </ResultPanel>
      </div>
    </Modal>
  );
}
