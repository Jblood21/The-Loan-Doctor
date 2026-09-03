import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { sellerNetSheet } from '@/lib/finance';
import { fmt } from '@/lib/format';
import { CalcField, Headline, ResultPanel, Row, type CalcProps } from './_shared';

export default function SellerNet({ open, onClose }: CalcProps) {
  const [salePrice, setSalePrice] = useState(450000);
  const [payoff, setPayoff] = useState(260000);
  const [commissionPct, setCommissionPct] = useState(5);
  const [costs, setCosts] = useState(4500);
  const [concessions, setConcessions] = useState(0);
  const [otherLiens, setOtherLiens] = useState(0);

  const set = (fn: (v: number) => void) => (v: string) => fn(v === '' ? 0 : parseFloat(v) || 0);

  const r = sellerNetSheet({
    salePrice,
    mortgagePayoff: payoff,
    commissionPct,
    sellerClosingCosts: costs,
    concessions,
    otherLiens,
  });

  return (
    <Modal open={open} onClose={onClose} title="Seller Net Sheet" subtitle="Estimated proceeds a seller walks away with." width={720}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1.1fr_1fr]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <CalcField label="Sale Price" prefix="$" value={salePrice} onChange={set(setSalePrice)} />
          <CalcField label="Mortgage Payoff" prefix="$" value={payoff} onChange={set(setPayoff)} />
          <CalcField label="Commission" suffix="%" value={commissionPct} onChange={set(setCommissionPct)} />
          <CalcField label="Seller Closing Costs" prefix="$" value={costs} onChange={set(setCosts)} />
          <CalcField label="Buyer Concessions" prefix="$" value={concessions} onChange={set(setConcessions)} />
          <CalcField label="Other Liens / Repairs" prefix="$" value={otherLiens} onChange={set(setOtherLiens)} />
        </div>
        <ResultPanel
          report={{
            key: 'sellernet',
            title: 'Seller Net Sheet',
            subtitle: `${r.netPct.toFixed(1)}% of the sale price`,
            headline: {
              label: 'Estimated Net Proceeds',
              value: fmt(r.netProceeds),
              sub: `${r.netPct.toFixed(1)}% of the sale price`,
            },
            inputs: [
              { label: 'Sale Price', value: fmt(salePrice) },
              { label: 'Mortgage Payoff', value: fmt(payoff) },
              { label: 'Commission', value: `${commissionPct}%` },
              { label: 'Seller Closing Costs', value: fmt(costs) },
            ],
            rows: [
              { label: 'Sale Price', value: fmt(r.salePrice) },
              { label: 'Agent Commission', value: `− ${fmt(r.commission)}` },
              { label: 'Mortgage Payoff', value: `− ${fmt(payoff)}` },
              { label: 'Closing Costs', value: `− ${fmt(costs)}` },
              { label: 'Net to Seller', value: fmt(r.netProceeds) },
            ],
          }}
        >
          <Headline
            label="Estimated Net Proceeds"
            value={fmt(r.netProceeds)}
            sub={`${r.netPct.toFixed(1)}% of the sale price`}
          />
          <Row label="Sale Price" value={fmt(r.salePrice)} />
          <Row label="Agent Commission" value={`− ${fmt(r.commission)}`} color="text-danger" />
          <Row label="Mortgage Payoff" value={`− ${fmt(payoff)}`} color="text-danger" />
          <Row label="Closing Costs" value={`− ${fmt(costs)}`} color="text-danger" />
          {concessions > 0 && <Row label="Buyer Concessions" value={`− ${fmt(concessions)}`} color="text-danger" />}
          {otherLiens > 0 && <Row label="Other Liens / Repairs" value={`− ${fmt(otherLiens)}`} color="text-danger" />}
          <Row label="Net to Seller" value={fmt(r.netProceeds)} color={r.netProceeds >= 0 ? 'text-brand-teal' : 'text-danger'} />
        </ResultPanel>
      </div>
      <p className="mt-4 text-[12px] leading-[1.5] text-text-dim2">
        Estimate only — actual proceeds depend on your title company's fees, prorated taxes, and payoff figures at closing.
      </p>
    </Modal>
  );
}
