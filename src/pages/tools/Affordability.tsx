import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { monthlyPayment } from '@/lib/finance';
import { fmt } from '@/lib/format';
import { CalcField, CalcSelect, Headline, ResultPanel, Row, TERM_OPTIONS, type CalcProps } from './_shared';

export default function Affordability({ open, onClose }: CalcProps) {
  const [income, setIncome] = useState(120000);
  const [debts, setDebts] = useState(600);
  const [down, setDown] = useState(40000);
  const [rate, setRate] = useState(6.5);
  const [term, setTerm] = useState('30');
  const [dti, setDti] = useState(43);
  const [taxRate, setTaxRate] = useState(1.25);
  const [insRate, setInsRate] = useState(0.35);
  const [hoa, setHoa] = useState(0);

  const set = (fn: (v: number) => void) => (v: string) => fn(v === '' ? 0 : parseFloat(v) || 0);

  // Max housing budget from DTI, then back out taxes/ins/HOA to leave room for P&I.
  const monthlyIncome = income / 12;
  const maxHousing = Math.max(0, (monthlyIncome * dti) / 100 - debts);
  // Iteratively solve: taxes + insurance scale with home price, which depends on the loan.
  // Approximate by solving for loan with taxes/ins on (loan + down).
  const r = rate / 100 / 12;
  const months = (parseInt(term, 10) || 30) * 12;
  const factor = r > 0 ? (r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1) : 1 / months;
  // maxHousing = P&I + (price)*(tax+ins)/12 + hoa ; price = loan + down ; loan = piBudget / factor
  // Let monthlyEscrowRate = (taxRate+insRate)/100/12. Solve loan:
  const escRate = (taxRate + insRate) / 100 / 12;
  // maxHousing - hoa = loan*factor + (loan+down)*escRate
  // loan*(factor+escRate) = maxHousing - hoa - down*escRate
  const loanBudget = maxHousing - hoa - down * escRate;
  const maxLoan = Math.max(0, loanBudget / (factor + escRate));
  const maxPrice = maxLoan + down;
  const pi = monthlyPayment(maxLoan, rate, parseInt(term, 10) || 30);
  const escrow = maxPrice * escRate;
  const totalPayment = pi + escrow + hoa;

  return (
    <Modal open={open} onClose={onClose} title="Affordability" subtitle="How much home a borrower can afford by income and DTI." width={720}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1.1fr_1fr]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <CalcField label="Annual Income" prefix="$" value={income} onChange={set(setIncome)} />
          <CalcField label="Monthly Debts" prefix="$" value={debts} onChange={set(setDebts)} />
          <CalcField label="Down Payment" prefix="$" value={down} onChange={set(setDown)} />
          <CalcField label="Interest Rate" suffix="%" value={rate} onChange={set(setRate)} />
          <CalcSelect label="Loan Term" value={term} onChange={setTerm} options={TERM_OPTIONS} />
          <CalcField label="Max DTI" suffix="%" value={dti} onChange={set(setDti)} />
          <CalcField label="Property Tax /yr" suffix="%" value={taxRate} onChange={set(setTaxRate)} />
          <CalcField label="Insurance /yr" suffix="%" value={insRate} onChange={set(setInsRate)} />
          <CalcField label="HOA (monthly)" prefix="$" value={hoa} onChange={set(setHoa)} />
        </div>
        <ResultPanel>
          <Headline label="Max Home Price" value={fmt(maxPrice)} sub={`At ${dti}% DTI · ${rate}% · ${term} yr`} />
          <Row label="Max Loan Amount" value={fmt(maxLoan)} color="text-text-primary" />
          <Row label="Principal & Interest" value={fmt(pi)} />
          <Row label="Taxes + Insurance" value={fmt(escrow)} />
          <Row label="HOA" value={fmt(hoa)} />
          <Row label="Total Housing Payment" value={fmt(totalPayment)} color="text-brand-teal" />
          <Row label="Max Allowed by DTI" value={fmt(maxHousing)} />
        </ResultPanel>
      </div>
    </Modal>
  );
}
