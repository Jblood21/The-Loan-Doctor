import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { amortizationSchedule, monthlyPayment } from '@/lib/finance';
import { fmt, fmt2 } from '@/lib/format';
import { CalcField, CalcSelect, Headline, ResultPanel, Row, TERM_OPTIONS, type CalcProps } from './_shared';
import { AreaChart } from '@/components/charts/AreaChart';

export default function Amortization({ open, onClose }: CalcProps) {
  const [loan, setLoan] = useState(320000);
  const [rate, setRate] = useState(6.5);
  const [term, setTerm] = useState('30');

  const set = (fn: (v: number) => void) => (v: string) => fn(v === '' ? 0 : parseFloat(v) || 0);
  const years = parseInt(term, 10) || 30;
  const pi = monthlyPayment(loan, rate, years);

  const { schedule, byYear, totalInterest } = useMemo(() => {
    const sched = amortizationSchedule(loan, rate, years);
    const agg: { year: number; principal: number; interest: number; balance: number }[] = [];
    sched.forEach((row) => {
      const y = Math.ceil(row.month / 12);
      let bucket = agg[y - 1];
      if (!bucket) {
        bucket = { year: y, principal: 0, interest: 0, balance: 0 };
        agg[y - 1] = bucket;
      }
      bucket.principal += row.principal;
      bucket.interest += row.interest;
      bucket.balance = row.balance;
    });
    return { schedule: sched, byYear: agg, totalInterest: sched.length ? sched[sched.length - 1].cumulativeInterest : 0 };
  }, [loan, rate, years]);

  const totalPaid = pi * schedule.length;

  return (
    <Modal open={open} onClose={onClose} title="Amortization" subtitle="Full payment schedule with principal and interest split." width={760}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_1fr]">
        <div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            <CalcField label="Loan Amount" prefix="$" value={loan} onChange={set(setLoan)} />
            <CalcField label="Interest Rate" suffix="%" value={rate} onChange={set(setRate)} />
            <CalcSelect label="Loan Term" value={term} onChange={setTerm} options={TERM_OPTIONS} />
          </div>
          <div className="mt-5">
            <ResultPanel>
              <Headline label="Monthly Principal & Interest" value={fmt2(pi)} sub={`${rate}% · ${years} yr`} />
              <Row label="Total Interest" value={fmt(totalInterest)} color="text-warn-text" />
              <Row label="Total Paid" value={fmt(totalPaid)} />
              <Row label="Payoff" value={`${Math.floor(schedule.length / 12)} yr ${schedule.length % 12} mo`} />
            </ResultPanel>
          </div>
        </div>
        <div className="max-h-[360px] overflow-y-auto rounded-xl border border-border">
          <div className="sticky top-0 grid grid-cols-4 gap-2 bg-elevated px-4 py-2.5 text-[11px] font-bold tracking-[0.5px] text-text-dim">
            <span>YEAR</span>
            <span className="text-right">PRINCIPAL</span>
            <span className="text-right">INTEREST</span>
            <span className="text-right">BALANCE</span>
          </div>
          {byYear.map((y) => (
            <div key={y.year} className="grid grid-cols-4 gap-2 border-b border-[rgba(140,165,195,0.06)] px-4 py-2 text-[13px]">
              <span className="text-text-soft">{y.year}</span>
              <span className="num text-right text-text-softer">{fmt(y.principal)}</span>
              <span className="num text-right text-warn-text">{fmt(y.interest)}</span>
              <span className="num text-right text-text-primary">{fmt(y.balance)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 text-[12.5px] font-semibold text-text-soft">Loan balance over time</div>
        <AreaChart
          points={[{ x: 0, y: loan }, ...byYear.map((y) => ({ x: y.year, y: y.balance }))]}
          height={190}
          formatY={(v) => fmt(v)}
          formatX={(x) => (x === 0 ? 'Start' : `Year ${x}`)}
          yLabel="Loan balance over time"
        />
      </div>
    </Modal>
  );
}
