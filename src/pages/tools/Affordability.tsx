import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { affordability } from '@/lib/affordability';
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

  const { maxPrice, maxLoan, pi, escrow, totalPayment, maxHousing } = affordability({
    income,
    debts,
    down,
    rate,
    term,
    dti,
    taxRate,
    insRate,
    hoa,
  });

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
        <ResultPanel
          report={{
            key: 'afford',
            title: 'Affordability',
            subtitle: `At ${dti}% DTI · ${rate}% · ${term} yr`,
            headline: { label: 'Max Home Price', value: fmt(maxPrice), sub: `At ${dti}% DTI · ${rate}% · ${term} yr` },
            inputs: [
              { label: 'Annual Income', value: fmt(income) },
              { label: 'Monthly Debts', value: fmt(debts) },
              { label: 'Down Payment', value: fmt(down) },
              { label: 'Interest Rate', value: `${rate}%` },
              { label: 'Loan Term', value: `${term} yr` },
              { label: 'Max DTI', value: `${dti}%` },
            ],
            rows: [
              { label: 'Max Loan Amount', value: fmt(maxLoan) },
              { label: 'Principal & Interest', value: fmt(pi) },
              { label: 'Taxes + Insurance', value: fmt(escrow) },
              { label: 'HOA', value: fmt(hoa) },
              { label: 'Total Housing Payment', value: fmt(totalPayment) },
            ],
          }}
        >
          <Headline label="Max Home Price" value={fmt(maxPrice)} sub={`At ${dti}% DTI · ${rate}% · ${term} yr`} />
          <Row label="Max Loan Amount" value={fmt(maxLoan)} color="text-text-primary" />
          <Row label="Principal & Interest" value={fmt(pi)} />
          <Row label="Taxes + Insurance" value={fmt(escrow)} />
          <Row label="HOA" value={fmt(hoa)} />
          <Row label="Total Housing Payment" value={fmt(totalPayment)} color="text-brand-teal" />
          <Row label="Max Allowed by DTI" value={fmt(maxHousing)} />
          <div className="mt-3 text-[12px] leading-[1.5] text-text-muted">
            43% is the conservative QM default; agency AUS (DU/LPA) often allows up to ~50% back-end DTI, and FHA higher
            with compensating factors. Adjust “Max DTI” to your program.
          </div>
        </ResultPanel>
      </div>
    </Modal>
  );
}
