import { useState } from 'react';
import { ArrowLeftRight, BarChart3, Home, Percent, PlusCircle, RefreshCw, ShieldCheck, TrendingDown, Receipt, Coins, Landmark } from 'lucide-react';
import type { ComponentType } from 'react';
import { PageHeader } from '@/components/PageHeader';
import type { CalcProps } from './tools/_shared';
import Affordability from './tools/Affordability';
import RentVsBuy from './tools/RentVsBuy';
import Amortization from './tools/Amortization';
import DTI from './tools/DTI';
import RefiBreakEven from './tools/RefiBreakEven';
import ExtraPayment from './tools/ExtraPayment';
import Buydown from './tools/Buydown';
import VaEntitlement from './tools/VaEntitlement';
import SellerNet from './tools/SellerNet';
import CashOut from './tools/CashOut';
import CountyIncome from './tools/CountyIncome';

interface Tool {
  key: string;
  title: string;
  desc: string;
  bg: string;
  fg: string;
  icon: ComponentType<{ size?: number | string; color?: string }>;
  Component: ComponentType<CalcProps>;
}

const TOOLS: Tool[] = [
  { key: 'afford', title: 'Affordability', desc: 'How much home a borrower can afford by income and DTI.', bg: 'rgba(47,128,237,.14)', fg: '#5fa8f5', icon: Home, Component: Affordability },
  { key: 'rentbuy', title: 'Rent vs. Buy', desc: 'Break-even timeline comparing renting to owning.', bg: 'rgba(45,212,191,.14)', fg: '#2dd4bf', icon: ArrowLeftRight, Component: RentVsBuy },
  { key: 'amort', title: 'Amortization', desc: 'Full payment schedule with principal and interest split.', bg: 'rgba(167,139,250,.14)', fg: '#a78bfa', icon: BarChart3, Component: Amortization },
  { key: 'dti', title: 'DTI Calculator', desc: 'Front- and back-end debt-to-income ratios.', bg: 'rgba(251,191,36,.14)', fg: '#fbbf24', icon: Percent, Component: DTI },
  { key: 'refi', title: 'Refi Break-Even', desc: 'Months to recoup closing costs on a refinance.', bg: 'rgba(52,211,153,.14)', fg: '#34d399', icon: RefreshCw, Component: RefiBreakEven },
  { key: 'extra', title: 'Extra Payment', desc: 'Interest saved and payoff time with extra principal.', bg: 'rgba(248,113,113,.14)', fg: '#f87171', icon: PlusCircle, Component: ExtraPayment },
  { key: 'buydown', title: 'Rate Buydown', desc: 'Permanent points vs. a temporary buydown — and which is worth it.', bg: 'rgba(56,189,248,.14)', fg: '#38bdf8', icon: TrendingDown, Component: Buydown },
  { key: 'va', title: 'VA Bonus Entitlement', desc: 'Second-tier entitlement, max $0-down loan, and required down payment.', bg: 'rgba(129,140,248,.14)', fg: '#818cf8', icon: ShieldCheck, Component: VaEntitlement },
  { key: 'sellernet', title: 'Seller Net Sheet', desc: 'Estimated proceeds a seller nets after payoff, commission, and costs.', bg: 'rgba(96,165,250,.14)', fg: '#60a5fa', icon: Receipt, Component: SellerNet },
  { key: 'cashout', title: 'Cash-Out / Consolidation', desc: 'Roll high-rate debt into the mortgage and compare monthly outflow.', bg: 'rgba(251,146,60,.14)', fg: '#fb923c', icon: Coins, Component: CashOut },
  { key: 'countyincome', title: 'County Median Income', desc: 'Median household income by county — real U.S. Census data. Pick a state and county.', bg: 'rgba(45,212,191,.14)', fg: '#2dd4bf', icon: Landmark, Component: CountyIncome },
];

export default function Tools() {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div className="animate-lp-fade">
      <PageHeader title="Tools" subtitle="Quick calculators to round out your borrower conversation." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setOpenKey(t.key)}
              className="group cursor-pointer rounded-[14px] border border-border bg-card p-[22px] text-left transition-all hover:-translate-y-0.5 hover:border-[rgba(45,212,191,0.4)]"
            >
              <div className="mb-4 flex h-[42px] w-[42px] items-center justify-center rounded-[11px]" style={{ background: t.bg, color: t.fg }}>
                <Icon size={20} color={t.fg} />
              </div>
              <div className="mb-1.5 text-[15.5px] font-semibold text-text-primary">{t.title}</div>
              <div className="text-[13px] leading-[1.5] text-text-muted">{t.desc}</div>
              <div className="mt-3.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-teal">
                Open <span className="text-[15px] transition-transform group-hover:translate-x-0.5">→</span>
              </div>
            </button>
          );
        })}
      </div>

      {TOOLS.map((t) => {
        const C = t.Component;
        return <C key={t.key} open={openKey === t.key} onClose={() => setOpenKey(null)} />;
      })}
    </div>
  );
}
