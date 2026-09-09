import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { monthlyPayment } from '@/lib/finance';
import { fmt } from '@/lib/format';
import { CalcField, CalcSelect, Headline, ResultPanel, Row, TERM_OPTIONS, type CalcProps } from './_shared';

export default function RentVsBuy({ open, onClose }: CalcProps) {
  const [rent, setRent] = useState(2200);
  const [rentGrowth, setRentGrowth] = useState(3);
  const [price, setPrice] = useState(400000);
  const [downPct, setDownPct] = useState(10);
  const [rate, setRate] = useState(6.5);
  const [term, setTerm] = useState('30');
  const [years, setYears] = useState(7);
  const [carryPct, setCarryPct] = useState(1.8); // taxes + ins + maintenance %/yr
  const [appreciation, setAppreciation] = useState(3.5);
  const [invReturn, setInvReturn] = useState(5);
  const [sellCostPct, setSellCostPct] = useState(7); // agent commission + closing at sale

  const set = (fn: (v: number) => void) => (v: string) => fn(v === '' ? 0 : parseFloat(v) || 0);

  const down = price * (downPct / 100);
  const loan = price - down;
  const pi = monthlyPayment(loan, rate, parseInt(term, 10) || 30);

  // Cumulative cost over N years.
  let rentCost = 0;
  let curRent = rent;
  for (let y = 0; y < years; y++) {
    rentCost += curRent * 12;
    curRent *= 1 + rentGrowth / 100;
  }
  // Opportunity cost: down payment invested instead.
  const investedDown = down * Math.pow(1 + invReturn / 100, years);
  const rentNetCost = rentCost - (investedDown - down); // renter keeps the growth on the down payment

  const ownPI = pi * 12 * years;
  const carry = price * (carryPct / 100) * years;
  const futureValue = price * Math.pow(1 + appreciation / 100, years);
  // Rough remaining balance after `years`.
  const r = rate / 100 / 12;
  const n = (parseInt(term, 10) || 30) * 12;
  const paidMonths = years * 12;
  const remaining = r > 0 ? loan * (Math.pow(1 + r, n) - Math.pow(1 + r, paidMonths)) / (Math.pow(1 + r, n) - 1) : loan * (1 - paidMonths / n);
  // Net the cost of selling (agent commission + closing) out of the sale price before
  // counting equity — otherwise buying looks better than it really is.
  const sellingCosts = futureValue * (sellCostPct / 100);
  const netSale = futureValue - sellingCosts;
  const equity = netSale - remaining;
  const ownNetCost = down + ownPI + carry - equity; // net of equity gained

  const buyWins = ownNetCost < rentNetCost;
  // Break-even year: first year owning net cost <= renting net cost.
  let breakEven = 0;
  {
    let rc = 0;
    let cr = rent;
    for (let y = 1; y <= 40; y++) {
      rc += cr * 12;
      cr *= 1 + rentGrowth / 100;
      const rNet = rc - (down * Math.pow(1 + invReturn / 100, y) - down);
      const fv = price * Math.pow(1 + appreciation / 100, y);
      const pm = y * 12;
      const rem = r > 0 ? loan * (Math.pow(1 + r, n) - Math.pow(1 + r, pm)) / (Math.pow(1 + r, n) - 1) : loan * (1 - pm / n);
      const eq = fv * (1 - sellCostPct / 100) - rem;
      const oNet = down + pi * 12 * y + price * (carryPct / 100) * y - eq;
      if (oNet <= rNet) {
        breakEven = y;
        break;
      }
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Rent vs. Buy" subtitle="Break-even timeline comparing renting to owning." width={760}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1.1fr_1fr]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <CalcField label="Monthly Rent" prefix="$" value={rent} onChange={set(setRent)} />
          <CalcField label="Rent Growth /yr" suffix="%" value={rentGrowth} onChange={set(setRentGrowth)} />
          <CalcField label="Home Price" prefix="$" value={price} onChange={set(setPrice)} />
          <CalcField label="Down Payment" suffix="%" value={downPct} onChange={set(setDownPct)} />
          <CalcField label="Interest Rate" suffix="%" value={rate} onChange={set(setRate)} />
          <CalcSelect label="Loan Term" value={term} onChange={setTerm} options={TERM_OPTIONS} />
          <CalcField label="Years to Stay" value={years} onChange={set(setYears)} />
          <CalcField label="Carry Costs /yr" suffix="%" value={carryPct} onChange={set(setCarryPct)} />
          <CalcField label="Home Appreciation /yr" suffix="%" value={appreciation} onChange={set(setAppreciation)} />
          <CalcField label="Investment Return /yr" suffix="%" value={invReturn} onChange={set(setInvReturn)} />
          <CalcField label="Selling Costs" suffix="%" value={sellCostPct} onChange={set(setSellCostPct)} />
        </div>
        <ResultPanel
          report={{
            key: 'rentbuy',
            title: 'Rent vs. Buy',
            subtitle: `Over ${years} years`,
            headline: {
              label: `Over ${years} years`,
              value: buyWins ? 'Buying wins' : 'Renting wins',
              sub: breakEven ? `Buying breaks even in year ${breakEven}` : 'No break-even within 40 years',
            },
            inputs: [
              { label: 'Monthly Rent', value: fmt(rent) },
              { label: 'Home Price', value: fmt(price) },
              { label: 'Down Payment', value: `${downPct}%` },
              { label: 'Interest Rate', value: `${rate}%` },
              { label: 'Years to Stay', value: String(years) },
            ],
            rows: [
              { label: 'Net cost of renting', value: fmt(rentNetCost) },
              { label: 'Net cost of buying', value: fmt(ownNetCost) },
              { label: 'Monthly P&I (buying)', value: fmt(pi) },
              { label: 'Projected home value', value: fmt(futureValue) },
              { label: `Selling costs (${sellCostPct}%)`, value: `–${fmt(sellingCosts)}` },
              { label: 'Net equity at sale', value: fmt(equity) },
            ],
          }}
        >
          <Headline
            label={`Over ${years} years`}
            value={buyWins ? 'Buying wins' : 'Renting wins'}
            sub={breakEven ? `Buying breaks even in year ${breakEven}` : 'Buying does not break even within 40 years'}
          />
          <Row label="Net cost of renting" value={fmt(rentNetCost)} color={!buyWins ? 'text-brand-teal' : undefined} />
          <Row label="Net cost of buying" value={fmt(ownNetCost)} color={buyWins ? 'text-brand-teal' : undefined} />
          <Row label="Monthly P&I (buying)" value={fmt(pi)} />
          <Row label="Projected home value" value={fmt(futureValue)} />
          <Row label={`Selling costs (${sellCostPct}%)`} value={`–${fmt(sellingCosts)}`} />
          <Row label="Net equity at sale" value={fmt(equity)} />
        </ResultPanel>
      </div>
    </Modal>
  );
}
