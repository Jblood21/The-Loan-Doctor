import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge, StubNote } from '@/components/ui/Badge';
import { Card, SectionLabel, Divider } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { TextField, Label } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { useScenarios } from '@/context/ScenariosContext';
import { useSettings } from '@/context/SettingsContext';
import { useUI } from '@/context/UIContext';
import { api } from '@/lib/api';
import { computeScenario } from '@/lib/finance';
import { buildPreApprovalLetter, LETTER_TEMPLATES, resolveTemplate } from '@/lib/letter';
import { fmt } from '@/lib/format';
import type { PreApprovalState } from '@/types';

// The Mortgage Expert brand palette.
const GREEN = '#1f3d25';
const GOLD = '#b18f3f';

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
    borrowerName: 'Robert Boot',
    propertyAddress: '205 Grand Avenue, Arco, ID 83213',
    expDays: '90',
  });
  const [losResults, setLosResults] = useState<Borrower[]>(STUB_BORROWERS);
  const [includeAgent, setIncludeAgent] = useState(true);
  const set = (patch: Partial<PreApprovalState>) => setPa((s) => ({ ...s, ...patch }));

  const srcScenario = scenarios[Math.min(pa.scenarioIdx, scenarios.length - 1)] || scenarios[0];
  const today = new Date();
  const hasAgent = !!(settings.agentName && settings.agentName.trim());

  // Letter template + editable body.
  const [templateId, setTemplateId] = useState('auto');
  const [bodyText, setBodyText] = useState('');
  const [customized, setCustomized] = useState(false);

  const tpl = useMemo(
    () => resolveTemplate(templateId, srcScenario, { borrowerName: pa.borrowerName, propertyAddress: pa.propertyAddress }),
    [templateId, srcScenario, pa.borrowerName, pa.propertyAddress],
  );
  // Seed the editable body from the template until the user customizes it.
  useEffect(() => {
    if (customized) return;
    setBodyText(tpl.paragraphs.join('\n\n'));
  }, [tpl, customized]);

  const parsedParagraphs = bodyText
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const letter = buildPreApprovalLetter(srcScenario, settings, {
    borrowerName: pa.borrowerName,
    propertyAddress: pa.propertyAddress,
    includeAgent,
    now: today,
    templateId,
    paragraphs: parsedParagraphs.length ? parsedParagraphs : undefined,
  });

  const onTemplateChange = (id: string) => {
    setCustomized(false);
    setTemplateId(id);
  };
  const resetTemplate = () => setCustomized(false);

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
      date: letter.date,
      reLine: letter.reLine,
      subjectAddress: letter.subjectAddress,
      salutation: letter.salutation,
      paragraphs: letter.paragraphs,
      closing: letter.closing,
      borrowerName: pa.borrowerName || '—',
      officer: { name: letter.officerName, title: letter.officerTitle, nmls: settings.nmls, email: settings.email, phone: settings.phone },
      lender: {
        name: settings.lenderName || settings.company,
        address: settings.lenderAddress,
        phone: settings.lenderPhone || settings.phone,
        email: settings.email,
        nmls: settings.lenderNmls || settings.nmls,
        website: settings.website,
      },
      agent: letter.agent,
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
      )}.\n\nBest regards,\n${settings.name}`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div className="animate-lp-fade">
      <PageHeader
        badge={<Badge tone="blue">Generator</Badge>}
        title="Pre-Approval Letter"
        subtitle="Pull a borrower from your LOS or a scenario, pick a program template, then generate a branded letter."
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
                      <div key={b.name} className="flex items-center justify-between rounded-[10px] border border-border-input bg-elevated px-3.5 py-[11px]">
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
          <div className="mb-5 flex flex-col gap-4">
            <div>
              <Label>Borrower Name(s)</Label>
              <TextField placeholder="Robert Boot" value={pa.borrowerName} onChange={(e) => set({ borrowerName: e.target.value })} />
              {srcScenario.borrowers === '2' && (
                <div className="mt-1.5 text-[12px] text-text-muted">Two borrowers — enter both names; the letter uses co-borrower wording.</div>
              )}
            </div>
            <div>
              <Label>Subject Property Address</Label>
              <TextField placeholder="205 Grand Avenue, Arco, ID 83213" value={pa.propertyAddress} onChange={(e) => set({ propertyAddress: e.target.value })} />
            </div>
          </div>

          {/* Letter template + editable body */}
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel>LETTER TEMPLATE</SectionLabel>
              {customized && (
                <button onClick={resetTemplate} className="cursor-pointer border-none bg-transparent text-[12px] font-semibold text-brand-blue-light underline">
                  Reset to template
                </button>
              )}
            </div>
            <Select
              value={templateId}
              onChange={(e) => onTemplateChange(e.target.value)}
              options={LETTER_TEMPLATES.map((t) => ({ value: t.id, label: t.label }))}
            />
            <div className="mt-1.5 text-[12px] text-text-muted">
              {customized ? 'Editing custom text — Reset re-syncs with the template & scenario.' : 'Pick a program, then edit the letter body below to taste.'}
            </div>
            <Label className="mt-3.5">Letter body (paragraphs separated by a blank line)</Label>
            <textarea
              value={bodyText}
              onChange={(e) => {
                setBodyText(e.target.value);
                setCustomized(true);
              }}
              rows={10}
              className="w-full resize-y rounded-[10px] border border-border-input bg-input p-3 text-[13px] leading-[1.6] text-text-primary outline-none transition-shadow focus:border-brand-blue focus:shadow-focus"
            />
          </div>

          {/* Dual branding */}
          <div className="mb-5 flex items-center justify-between rounded-[10px] border border-border-input bg-input px-3.5 py-3">
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
              className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-40 ${includeAgent && hasAgent ? 'bg-brand-blue' : 'bg-border-input'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${includeAgent && hasAgent ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          <div className="flex gap-2.5">
            <Button variant="primary" className="flex-1 !h-[46px]" onClick={downloadPdf}>
              Download PDF
            </Button>
            <Button variant="secondary" className="!h-[46px] !px-[18px]" onClick={emailLetter}>
              Email
            </Button>
          </div>
          <div className="mt-3.5">
            <StubNote>
              The letterhead, signature, and contact footer come from Settings. LOS borrower pull is a stubbed sandbox;
              the PDF is generated by the backend — wire your real LOS API and e-sign/email service for production.
            </StubNote>
          </div>
        </Card>

        {/* RIGHT — live letter preview */}
        <div className="sticky top-5">
          <div className="rounded-2xl bg-[#eef1f5] p-1.5 shadow-letter">
            <div className="flex min-h-[660px] flex-col overflow-hidden rounded-[11px] bg-white" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
              {/* Letterhead */}
              <div className="px-10 pt-9">
                <img src="/brand/letterhead-logo.jpg" alt="The Mortgage Expert — Alan Blood" className="h-[58px] w-auto" />
                <div className="mt-4 h-[3px] w-full rounded" style={{ background: GOLD }} />
              </div>

              {/* Body */}
              <div className="flex-1 px-10 py-7 text-[#1b2733]">
                <div className="text-[12.5px] text-[#555]">{letter.date}</div>
                <div className="mt-5 text-[13.5px]">
                  <span className="font-bold">RE:</span> {letter.reLine}
                </div>
                {letter.subjectAddress && (
                  <div className="ml-[30px] text-[13.5px] font-bold" style={{ color: GREEN }}>
                    {letter.subjectAddress}
                  </div>
                )}
                <div className="mt-5 text-[13.5px]">{letter.salutation}</div>
                {letter.paragraphs.map((p, i) => (
                  <p key={i} className="mt-3.5 text-[13.5px] leading-[1.65]">
                    {p}
                  </p>
                ))}
                <div className="mt-7 text-[13.5px]">{letter.closing}</div>
                <div className="mt-1 text-[15px] font-bold" style={{ color: GREEN }}>
                  {letter.officerName}
                </div>
                <div className="text-[12.5px] text-[#5b6b7b]">{letter.officerTitle}</div>
                {letter.partnerLine && <div className="mt-2 text-[12px] italic text-[#5b6b7b]">{letter.partnerLine}</div>}
              </div>

              {/* Contact footer band */}
              <div className="mt-auto" style={{ background: GREEN, borderTop: `4px solid ${GOLD}` }}>
                <div className="flex items-center gap-4 px-9 py-5">
                  <img src="/brand/officer-headshot.png" alt={settings.name} className="h-[62px] w-[62px] flex-shrink-0 rounded-full border-2 object-cover object-top" style={{ borderColor: GOLD }} />
                  <div className="text-[11.5px] leading-[1.5] text-white">
                    <div className="font-semibold">
                      {settings.phone}
                      {settings.email ? <span className="text-[#cfe0d2]">{'  ·  '}{settings.email}</span> : null}
                    </div>
                    <div className="text-[#dfeae0]">{settings.lenderAddress}</div>
                    <div className="text-[#dfeae0]">{settings.lenderName}</div>
                    <div style={{ color: GOLD }}>
                      NMLS# {settings.lenderNmls || settings.nmls}
                      {settings.website ? `   ·   ${settings.website}` : ''}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
