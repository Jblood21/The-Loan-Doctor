import { useState } from 'react';
import { ArrowLeftRight, BarChart3, Home, Percent, PlusCircle, RefreshCw, ShieldCheck, TrendingDown, Receipt, Coins, Landmark, FileText, X } from 'lucide-react';
import type { ComponentType } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useReport } from '@/context/ReportContext';
import { useSettings } from '@/context/SettingsContext';
import { api } from '@/lib/api';
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
  { key: 'countyincome', title: 'County Median Income', desc: 'Median household income by county with 80% & 100% for Home Possible — real U.S. Census data.', bg: 'rgba(45,212,191,.14)', fg: '#2dd4bf', icon: Landmark, Component: CountyIncome },
];

export default function Tools() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const { sections, remove, clear } = useReport();
  const { settings } = useSettings();
  const [preparedFor, setPreparedFor] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const downloadReport = async () => {
    if (!sections.length) return;
    setBusy(true);
    setErr('');
    try {
      const blob = await api.reportPdf({
        preparedFor: preparedFor.trim(),
        sections,
        officer: { name: settings.name, title: settings.officerTitle },
        lender: {
          name: settings.lenderName || settings.company,
          phone: settings.phone,
          email: settings.email,
          nmls: settings.lenderNmls || settings.nmls,
          website: settings.website,
          address: settings.lenderAddress,
        },
        logo: settings.logoDataUrl || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `loan-analysis-report${preparedFor ? '-' + preparedFor.trim().split(/\s+/).pop() : ''}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErr('Could not generate the report. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-lp-fade">
      <PageHeader title="Tools" subtitle="Quick calculators to round out your borrower conversation." />

      {sections.length > 0 && (
        <div className="mb-6 rounded-[14px] border border-[rgba(45,212,191,0.3)] bg-[rgba(45,212,191,0.06)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[14px] font-semibold text-text-primary">
              <FileText size={17} className="text-brand-teal" />
              Report — {sections.length} tool{sections.length > 1 ? 's' : ''} added
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clear}
                className="rounded-[9px] border border-border px-3 py-1.5 text-[13px] font-medium text-text-soft transition-colors hover:border-danger hover:text-danger"
              >
                Clear
              </button>
              <button
                onClick={downloadReport}
                disabled={busy}
                className="rounded-[9px] bg-brand-teal px-4 py-1.5 text-[13px] font-semibold text-[#04121a] transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy ? 'Generating…' : 'Download Report PDF'}
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {sections.map((s) => (
              <span
                key={s.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-seg bg-card px-2.5 py-1 text-[12px] text-text-soft"
              >
                {s.title}
                <button onClick={() => remove(s.key)} aria-label={`Remove ${s.title}`} className="text-text-dim hover:text-danger">
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-3 max-w-[360px]">
            <input
              value={preparedFor}
              onChange={(e) => setPreparedFor(e.target.value)}
              placeholder="Prepared for (borrower name — optional)"
              className="h-[42px] w-full rounded-[10px] border border-border-input bg-input px-[14px] text-[14px] text-text-primary outline-none placeholder:text-text-dim focus:border-brand-blue focus:shadow-focus"
            />
          </div>
          {err && <div className="mt-2 text-[12.5px] text-danger">{err}</div>}
        </div>
      )}

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
