import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { amortizationSchedule, monthlyPayment } from '@/lib/finance';
import { fmt, fmt2 } from '@/lib/format';
import { CalcField, Headline, ResultPanel, Row, type CalcProps } from './_shared';

export default function RefiBreakEven({ open, onClose }: CalcProps) {
  const [balance, setBalance] = useState(320000);
  const [curRate, setCurRate] = useState(7.25);
  const [curRemaining, setCurRemaining] = useState(28);
  const [newRate, setNewRate] = useState(6.0);
  const [newTerm, setNewTerm] = useState(30);
  const [costs, setCosts] = useState(6500);

  const set = (fn: (v: number) => void) => (v: string) => fn(v === '' ? 0 : parseFloat(v) || 0);

  const curPayment = monthlyPayment(balance, curRate, curRemaining);
  const newPayment = monthlyPayment(balance, newRate, newTerm);
  const savings = curPayment - newPayment;
  const breakEvenMonths = savings > 0 ? costs / savings : Infinity;

  const curInterest = amortizationSchedule(balance, curRate, curRemaining).reduce((a, r) => a + r.interest, 0);
  const newInterest = amortizationSchedule(balance, newRate, newTerm).reduce((a, r) => a + r.interest, 0);

  return (
    <Modal open={open} onClose={onClose} title="Refi Break-Even" subtitle="Months to recoup closing costs on a refinance." width={720}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1.1fr_1fr]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <CalcField label="Current Balance" prefix="$" value={balance} onChange={set(setBalance)} />
          <CalcField label="Current Rate" suffix="%" value={curRate} onChange={set(setCurRate)} />
          <CalcField label="Years Remaining" value={curRemaining} onChange={set(setCurRemaining)} />
          <CalcField label="New Rate" suffix="%" value={newRate} onChange={set(setNewRate)} />
          <CalcField label="New Term (yrs)" value={newTerm} onChange={set(setNewTerm)} />
          <CalcField label="Closing Costs" prefix="$" value={costs} onChange={set(setCosts)} />
        </div>
        <ResultPanel
          report={{
            key: 'refi',
            title: 'Refi Break-Even',
            headline: {
              label: 'Break-Even',
              value: Number.isFinite(breakEvenMonths) ? `${Math.ceil(breakEvenMonths)} mo` : '—',
              sub: Number.isFinite(breakEvenMonths)
                ? `≈ ${(breakEvenMonths / 12).toFixed(1)} years to recoup costs`
                : 'No monthly savings at these terms',
            },
            inputs: [
              { label: 'Current Balance', value: fmt(balance) },
              { label: 'Current Rate', value: `${curRate}%` },
              { label: 'New Rate', value: `${newRate}%` },
              { label: 'Closing Costs', value: fmt(costs) },
            ],
            rows: [
              { label: 'Current Payment', value: fmt2(curPayment) },
              { label: 'New Payment', value: fmt2(newPayment) },
              { label: 'Monthly Savings', value: fmt2(Math.max(0, savings)) },
              { label: 'Lifetime Interest (current)', value: fmt(curInterest) },
              { label: 'Lifetime Interest (new)', value: fmt(newInterest) },
            ],
          }}
        >
          <Headline
            label="Break-Even"
            value={Number.isFinite(breakEvenMonths) ? `${Math.ceil(breakEvenMonths)} mo` : '—'}
            sub={
              Number.isFinite(breakEvenMonths)
                ? `≈ ${(breakEvenMonths / 12).toFixed(1)} years to recoup costs`
                : 'No monthly savings at these terms'
            }
          />
          <Row label="Current Payment" value={fmt2(curPayment)} />
          <Row label="New Payment" value={fmt2(newPayment)} />
          <Row label="Monthly Savings" value={fmt2(Math.max(0, savings))} color={savings > 0 ? 'text-brand-teal' : 'text-danger'} />
          <Row label="Lifetime Interest (current)" value={fmt(curInterest)} />
          <Row label="Lifetime Interest (new)" value={fmt(newInterest)} color={newInterest < curInterest ? 'text-good' : 'text-warn-text'} />
        </ResultPanel>
      </div>
    </Modal>
  );
}
