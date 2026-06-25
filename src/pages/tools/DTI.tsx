import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { fmt, pct } from '@/lib/format';
import { CalcField, Headline, ResultPanel, Row, type CalcProps } from './_shared';

function rating(dti: number): { label: string; color: string } {
  if (dti <= 36) return { label: 'Strong', color: 'text-good' };
  if (dti <= 43) return { label: 'Acceptable', color: 'text-brand-teal' };
  if (dti <= 50) return { label: 'Elevated', color: 'text-warn' };
  return { label: 'High risk', color: 'text-danger' };
}

export default function DTI({ open, onClose }: CalcProps) {
  const [income, setIncome] = useState(8500);
  const [housing, setHousing] = useState(2400);
  const [car, setCar] = useState(450);
  const [cards, setCards] = useState(180);
  const [student, setStudent] = useState(250);
  const [other, setOther] = useState(0);

  const set = (fn: (v: number) => void) => (v: string) => fn(v === '' ? 0 : parseFloat(v) || 0);
  const debts = car + cards + student + other;
  const frontEnd = income > 0 ? (housing / income) * 100 : 0;
  const backEnd = income > 0 ? ((housing + debts) / income) * 100 : 0;
  const r = rating(backEnd);

  return (
    <Modal open={open} onClose={onClose} title="DTI Calculator" subtitle="Front- and back-end debt-to-income ratios." width={720}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1.1fr_1fr]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <CalcField label="Gross Monthly Income" prefix="$" value={income} onChange={set(setIncome)} />
          <CalcField label="Proposed Housing (PITI)" prefix="$" value={housing} onChange={set(setHousing)} />
          <CalcField label="Car Payments" prefix="$" value={car} onChange={set(setCar)} />
          <CalcField label="Credit Cards (min)" prefix="$" value={cards} onChange={set(setCards)} />
          <CalcField label="Student Loans" prefix="$" value={student} onChange={set(setStudent)} />
          <CalcField label="Other Debts" prefix="$" value={other} onChange={set(setOther)} />
        </div>
        <ResultPanel>
          <Headline label="Back-End DTI" value={pct(backEnd, 1)} sub={`Rating: ${r.label}`} />
          <Row label="Front-End DTI (housing)" value={pct(frontEnd, 1)} />
          <Row label="Total Monthly Debts" value={fmt(housing + debts)} />
          <Row label="Non-housing debts" value={fmt(debts)} />
          <div className="mt-3 text-[12.5px] leading-[1.5] text-text-muted">
            Conventional loans generally cap back-end DTI near 43–50%; FHA can stretch higher with compensating factors.
          </div>
        </ResultPanel>
      </div>
    </Modal>
  );
}
