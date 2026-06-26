import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge, StubNote } from '@/components/ui/Badge';
import { Card, SectionLabel, Divider } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { TextField, Label } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { LogoMark } from '@/components/Logo';
import { useScenarios } from '@/context/ScenariosContext';
import { useSettings } from '@/context/SettingsContext';
import { useUI } from '@/context/UIContext';
import { api } from '@/lib/api';
import { computeScenario } from '@/lib/finance';
import { buildPreApprovalLetter } from '@/lib/letter';
import { fmt, longDate } from '@/lib/format';
import type { PreApprovalState } from '@/types';

const PROVIDERS = [
  { value: 'arive', label: 'Arive' },
  { value: 'encompass', label: 'ICE / Encompass' },
  { value: 'calyx', label: 'Calyx Point' },
  { value: 'byte', label: 'BytePro' },
];

interface Borrower {
  name: string;
  meta: string;
  address: string;
}

const STUB_BORROWERS: Borrower[] = [
  { name: 'Michael & Laura Thompson', meta: 'Loan #LN-20471 · $425,000', address: '48 Birchwood Ln, Madison, WI 53703' },
  { name: 'Aisha Bennett', meta: 'Loan #LN-20493 · $310,000', address: '210 Cedar St, Austin, TX 78702' },
  { name: 'Robert & Diane Alvarez', meta: 'Loan #LN-20510 · $560,000', address: '12 Lakeshore Dr, Tampa, FL 33602' },
];

export default function PreApproval() {
  const { scenarios } = useScenarios();
  const { settings } = useSettings();
  const { openSettings } = useUI();
  const [pa, setPa] = useState<PreApprovalState>({
    source: 'scenario',
    scenarioIdx: 0,
    losProvider: 'arive',
    losConnected: false,
    losQuery: '',
    borrowerName: 'Michael & Laura Thompson',
    propertyAddress: '',
    expDays: '90',
  });
  const [losResults, setLosResults] = useState<Borrower[]>(STUB_BORROWERS);
  const [includeAgent, setIncludeAgent] = useState(true);
  const set = (patch: Partial<PreApprovalState>) => setPa((s) => ({ ...s, ...patch }));

  const srcScenario = scenarios[Math.min(pa.scenarioIdx, scenarios.length - 1)] || scenarios[0];
  const today = new Date();
  const hasAgent = !!(settings.agentName && settings.agentName.trim());

  const letter = buildPreApprovalLetter(srcScenario, settings, {
    borrowerName: pa.borrowerName,
    propertyAddress: pa.propertyAddress,
    expDays: parseInt(pa.expDays, 10),
    includeAgent,
    now: today,
  });

  // LOS borrower search (backend with stub fallback).
  useEffect(() => {
    if (pa.source !== 'los' || !pa.losConnected) return;
    let cancelled = false;
    (async () => {
      try {
        const { results } = await api.losSearch(pa.losProvider, pa.losQuery);
        if (!cancelled && results) setLosResults(results);
      } catch {
        const q = pa.losQuery.trim().toLowerCase();
        setLosResults(
          q ? STUB_BORROWERS.filter((b) => b.name.toLowerCase().includes(q) || b.meta.toLowerCase().includes(q)) : STUB_BORROWERS,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pa.source, pa.losConnected, pa.losProvider, pa.losQuery]);

  const connect = async () => {
    try {
      await api.losConnect(pa.losProvider);
    } catch {
      /* optimistic in demo mode */
    }
    set({ losConnected: true });
  };
  const disconnect = async () => {
    try {
      await api.losDisconnect(pa.losProvider);
    } catch {
      /* ignore */
    }
    set({ losConnected: false });
  };

  const downloadPdf = async () => {
    const payload = {
      heading: letter.heading,
      salutation: letter.salutation,
      intro: letter.intro,
      blurb: letter.blurb,
      validity: letter.validity,
      borrowerName: pa.borrowerName || '—',
      propertyAddress: pa.propertyAddress,
      lender: {
        name: settings.lenderName || settings.company,
        address: settings.lenderAddress,
        phone: settings.lenderPhone || settings.phone,
        nmls: settings.lenderNmls || settings.nmls,
      },
      officer: { name: settings.name, nmls: settings.nmls, company: settings.company, phone: settings.phone },
      agent: letter.agent,
      terms: letter.terms,
      today: longDate(today),
    };
    try {
      const blob = await api.preApprovalPdf(payload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `preapproval-${(pa.borrowerName || 'letter').split(' ').pop()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('PDF service unavailable — start the API server (npm run dev). Using the browser print dialog instead.');
      window.print();
    }
  };

  const emailLetter = () => {
    const subject = encodeURIComponent('Your Pre-Approval Letter');
    const body = encodeURIComponent(
      `Hi ${pa.borrowerName},\n\nAttached is your pre-approval letter for a ${computeScenario(srcScenario).typeLabel} loan of ${fmt(
        computeScenario(srcScenario).baseLoan,
      )}.\n\nBest,\n${settings.name}`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div className="animate-lp-fade">
      <PageHeader
        badge={<Badge tone="blue">Generator</Badge>}
        title="Pre-Approval Letter"
        subtitle="Pull a borrower from your LOS or an existing scenario, then generate a branded letter that adapts to the loan."
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_1.05fr]">
        {/* LEFT — form */}
        <Card className="p-6">
          <SectionLabel className="mb-3">DATA SOURCE</SectionLabel>
          <SegmentedControl
            className="mb-[22px]"
            options={[
              { value: 'scenario', label: 'From a Scenario' },
              { value: 'los', label: 'From your LOS' },
            ]}
            value={pa.source}
            onChange={(v) => set({ source: v as PreApprovalState['source'] })}
          />

          {pa.source === 'scenario' && (
            <div className="mb-[22px]">
              <Label>Choose a saved scenario</Label>
              <Select
                value={String(pa.scenarioIdx)}
                onChange={(e) => set({ scenarioIdx: parseInt(e.target.value, 10) })}
                options={scenarios.map((s, i) => ({
                  value: i,
                  label: `${s.name || `Scenario ${i + 1}`} · ${computeScenario(s).typeLabel} · ${fmt(computeScenario(s).baseLoan)}`,
                }))}
              />
              <div className="mt-2.5 text-[12.5px] text-[#7d96ae]">
                The letter’s wording adapts to this scenario — loan type, purchase vs. refinance, and borrower count.
              </div>
            </div>
          )}

          {pa.source === 'los' && (
            <div className="mb-[22px]">
              <Label>LOS provider</Label>
              <Select
                className="mb-3.5"
                value={pa.losProvider}
                onChange={(e) => set({ losProvider: e.target.value as PreApprovalState['losProvider'] })}
                options={PROVIDERS}
              />
              {!pa.losConnected ? (
                <div className="rounded-xl border border-dashed border-[#2f4663] bg-input p-[18px] text-center">
                  <div className="mb-3 text-[13.5px] text-text-soft">Connect to pull borrowers directly from your pipeline.</div>
                  <Button variant="primary" className="!h-[42px] !px-5" onClick={connect}>
                    Connect to LOS
                  </Button>
                </div>
              ) : (
                <div>
                  <div className="mb-3 flex items-center justify-between rounded-[10px] border border-[rgba(52,211,153,0.25)] bg-[rgba(52,211,153,0.1)] px-3.5 py-2.5">
                    <span className="flex items-center gap-2 text-[13px] font-semibold text-good">
                      <span className="h-2 w-2 rounded-full bg-good" />
                      Connected
                    </span>
                    <button onClick={disconnect} className="cursor-pointer border-none bg-transparent text-[12.5px] text-text-muted underline">
                      Disconnect
                    </button>
                  </div>
                  <TextField
                    className="mb-3 !h-11 !text-[14px]"
                    placeholder="Search borrower by name or loan #"
                    value={pa.losQuery}
                    onChange={(e) => set({ losQuery: e.target.value })}
                  />
                  <div className="flex flex-col gap-2">
                    {losResults.map((b) => (
                      <div
                        key={b.name}
                        className="flex items-center justify-between rounded-[10px] border border-border-input bg-elevated px-3.5 py-[11px]"
                      >
                        <div>
                          <div className="text-[13.5px] font-semibold text-text-primary">{b.name}</div>
                          <div className="text-[12px] text-text-muted">{b.meta}</div>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="!border-brand-blue !bg-[rgba(47,128,237,0.12)] !text-brand-blue-light"
                          onClick={() => set({ borrowerName: b.name, propertyAddress: b.address })}
                        >
                          Use
                        </Button>
                      </div>
                    ))}
                    {losResults.length === 0 && <div className="py-2 text-[12.5px] text-text-muted">No borrowers match.</div>}
                  </div>
                </div>
              )}
            </div>
          )}

          <Divider className="mb-5" />
          <div className="flex flex-col gap-4">
            <div>
              <Label>Borrower Name(s)</Label>
              <TextField placeholder="Michael & Laura Thompson" value={pa.borrowerName} onChange={(e) => set({ borrowerName: e.target.value })} />
              {srcScenario.borrowers === '2' && (
                <div className="mt-1.5 text-[12px] text-text-muted">
                  This scenario has two borrowers — enter both names (e.g. “Michael &amp; Laura Thompson”). The letter uses co-borrower wording.
                </div>
              )}
            </div>
            <div>
              <Label>Property Address (optional)</Label>
              <TextField placeholder="123 Main St, City, ST 12345" value={pa.propertyAddress} onChange={(e) => set({ propertyAddress: e.target.value })} />
            </div>
            <div>
              <Label>Letter Valid For</Label>
              <Select
                value={pa.expDays}
                onChange={(e) => set({ expDays: e.target.value as PreApprovalState['expDays'] })}
                options={[
                  { value: '30', label: '30 days' },
                  { value: '60', label: '60 days' },
                  { value: '90', label: '90 days' },
                ]}
              />
            </div>

            {/* Dual branding */}
            <div className="flex items-center justify-between rounded-[10px] border border-border-input bg-input px-3.5 py-3">
              <div className="pr-3">
                <div className="text-[13px] font-semibold text-text-label">Dual branding (real-estate agent)</div>
                <div className="text-[12px] text-text-muted">
                  {hasAgent ? (
                    <>Co-brand with {settings.agentName}{settings.brokerage ? `, ${settings.brokerage}` : ''}</>
                  ) : (
                    <>
                      No agent saved.{' '}
                      <button onClick={openSettings} className="cursor-pointer border-none bg-transparent p-0 text-brand-blue-light underline">
                        Add one in Settings
                      </button>
                    </>
                  )}
                </div>
              </div>
              <button
                role="switch"
                aria-checked={includeAgent && hasAgent}
                disabled={!hasAgent}
                onClick={() => setIncludeAgent((v) => !v)}
                className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-40 ${
                  includeAgent && hasAgent ? 'bg-brand-blue' : 'bg-border-input'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                    includeAgent && hasAgent ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="mt-[22px] flex gap-2.5">
            <Button variant="primary" className="flex-1 !h-[46px]" onClick={downloadPdf}>
              Download PDF
            </Button>
            <Button variant="secondary" className="!h-[46px] !px-[18px]" onClick={emailLetter}>
              Email
            </Button>
          </div>
          <div className="mt-3.5">
            <StubNote>
              LOS borrower pull is a stubbed provider sandbox; the PDF is generated by the backend. Wire your real LOS
              API and an e-sign/email service for production.
            </StubNote>
          </div>
        </Card>

        {/* RIGHT — live letter preview (light) */}
        <div className="sticky top-5">
          <div className="rounded-2xl bg-[#eef1f5] p-1.5 shadow-letter">
            <div className="min-h-[540px] rounded-[11px] bg-white px-9 py-[38px] text-[#1b2733]">
              <div className="mb-[22px] flex items-center justify-between border-b-2 border-[#0c2238] pb-[18px]">
                <div>
                  <div className="font-display text-[20px] font-bold text-[#0c2238]">{settings.lenderName || 'ABC Mortgage'}</div>
                  <div className="mt-[3px] text-[11.5px] text-[#5b6b7b]">{settings.lenderAddress || '123 Main Street, Suite 100 · New York, NY 10001'}</div>
                  <div className="text-[11.5px] text-[#5b6b7b]">
                    {settings.lenderPhone || '(800) 555-1234'} · NMLS #{settings.lenderNmls || '123456'}
                  </div>
                </div>
                <LogoMark size={46} stroke="#fff" />
              </div>

              <div className="mb-[18px] text-[12.5px] text-[#5b6b7b]">{longDate(today)}</div>
              <div className="mb-3.5 text-[18px] font-bold text-[#0c2238]">{letter.heading}</div>
              <p className="mb-[13px] text-[13.5px] leading-[1.7]">{letter.salutation}</p>
              <p className="mb-4 text-[13.5px] leading-[1.7]">{letter.intro}</p>

              <div className="mb-[18px] rounded-[10px] bg-[#f4f6f9] px-5 py-4">
                {letter.terms.map((row) => (
                  <div key={row.label} className="flex justify-between border-b border-[#e3e8ee] py-[7px] text-[13px] last:border-0">
                    <span className="text-[#5b6b7b]">{row.label}</span>
                    <span className="num font-semibold text-[#0c2238]">{row.value}</span>
                  </div>
                ))}
              </div>

              {letter.blurb && <p className="mb-4 text-[13.5px] leading-[1.7]">{letter.blurb}</p>}
              <p className="mb-4 text-[13.5px] leading-[1.7]">
                This pre-approval is valid through <strong>{letter.expDate}</strong> and is subject to property
                appraisal, title review, and final underwriting verification.
              </p>

              <p className="mb-1 text-[13.5px]">Sincerely,</p>
              <div className="mt-1 font-display text-[17px] italic text-[#0c2238]">{letter.signatureName}</div>
              <div className="text-[12px] text-[#5b6b7b]">{letter.signatureLine}</div>

              {/* Dual-branding block */}
              {letter.agent && (
                <div className="mt-5 grid grid-cols-2 gap-4 rounded-[10px] border border-[#e3e8ee] bg-[#f9fafb] px-5 py-4">
                  <div>
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.6px] text-[#9aa7b4]">Your Loan Officer</div>
                    <div className="text-[13px] font-semibold text-[#0c2238]">{settings.name || 'John Smith'}</div>
                    <div className="text-[11.5px] text-[#5b6b7b]">NMLS #{settings.nmls || '123456'} · {settings.company || 'ABC Mortgage'}</div>
                    {(settings.lenderPhone || settings.phone) && (
                      <div className="text-[11.5px] text-[#5b6b7b]">{settings.lenderPhone || settings.phone}</div>
                    )}
                  </div>
                  <div className="border-l border-[#e3e8ee] pl-4">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.6px] text-[#9aa7b4]">Your Real Estate Agent</div>
                    <div className="text-[13px] font-semibold text-[#0c2238]">{letter.agent.name}</div>
                    {letter.agent.brokerage && <div className="text-[11.5px] text-[#5b6b7b]">{letter.agent.brokerage}</div>}
                    {letter.agent.phone && <div className="text-[11.5px] text-[#5b6b7b]">{letter.agent.phone}</div>}
                  </div>
                </div>
              )}

              <div className="mt-[18px] border-t border-[#e3e8ee] pt-3.5 text-[10px] leading-[1.5] text-[#9aa7b4]">
                Equal Housing Lender. This is not a commitment to lend. All loans are subject to credit approval,
                verification of information, and satisfactory appraisal.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
