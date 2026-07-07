import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
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
import { api, ApiError } from '@/lib/api';
import { computeScenario } from '@/lib/finance';
import {
  buildPreApprovalLetter,
  LETTER_TEMPLATES,
  LETTERHEAD_STYLES,
  PRONOUN_OPTIONS,
  resolveTemplate,
  SALUTATION_PRESETS,
  CLOSING_PRESETS,
} from '@/lib/letter';
import type { PronounChoice } from '@/lib/letter';
import { fmt, longDateWeekday } from '@/lib/format';
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

/** Compact labeled toggle switch. */
function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between rounded-[10px] border border-border-input bg-input px-3.5 py-2.5">
      <div className="pr-3">
        <div className="text-[13px] font-semibold text-text-label">{label}</div>
        {hint && <div className="text-[11.5px] text-text-muted">{hint}</div>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${checked ? 'bg-brand-blue' : 'bg-border-input'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

function PresetChips({ presets, onPick }: { presets: string[]; onPick: (v: string) => void }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {presets.map((p) => (
        <button
          key={p}
          onClick={() => onPick(p)}
          className="cursor-pointer rounded-full border border-border-seg bg-input px-2.5 py-1 text-[11.5px] text-text-soft hover:border-brand-teal hover:text-brand-teal"
        >
          {p}
        </button>
      ))}
    </div>
  );
}

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
  const [losMode, setLosMode] = useState<'live' | 'zapier' | 'demo'>('demo');
  const [losOpen, setLosOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookCount, setWebhookCount] = useState(0);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookError, setWebhookError] = useState('');
  const [copied, setCopied] = useState(false);
  const [includeAgent, setIncludeAgent] = useState(true);
  const set = (patch: Partial<PreApprovalState>) => setPa((s) => ({ ...s, ...patch }));

  const srcScenario = scenarios[Math.min(pa.scenarioIdx, scenarios.length - 1)] || scenarios[0];
  const today = new Date();
  const hasAgent = !!(settings.agentName && settings.agentName.trim());

  // Program template + editable body.
  const [templateId, setTemplateId] = useState('auto');
  const [bodyText, setBodyText] = useState('');
  const [customized, setCustomized] = useState(false);
  const [pronoun, setPronoun] = useState<PronounChoice>('they');

  // Letter customization.
  const [styleId, setStyleId] = useState('mortgage-expert');
  const [reLine, setReLine] = useState('');
  const [salutation, setSalutation] = useState('To Whom It May Concern:');
  const [closing, setClosing] = useState('Best regards,');
  const [title, setTitle] = useState('');
  const [dateMode, setDateMode] = useState<'auto' | 'custom'>('auto');
  const [customDate, setCustomDate] = useState('');
  const [showTerms, setShowTerms] = useState(false);
  const [showValidity, setShowValidity] = useState(false);
  const [showHeadshot, setShowHeadshot] = useState(true);
  const [showSubjectAddress, setShowSubjectAddress] = useState(true);
  const [expDays, setExpDays] = useState('90');

  const tpl = useMemo(
    () => resolveTemplate(templateId, srcScenario, { borrowerName: pa.borrowerName, propertyAddress: pa.propertyAddress, pronoun }),
    [templateId, srcScenario, pa.borrowerName, pa.propertyAddress, pronoun],
  );
  useEffect(() => {
    if (customized) return;
    setBodyText(tpl.paragraphs.join('\n\n'));
  }, [tpl, customized]);

  const parsedParagraphs = bodyText
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const dateText = dateMode === 'custom' && customDate ? longDateWeekday(new Date(`${customDate}T12:00:00`)) : '';

  const letter = buildPreApprovalLetter(srcScenario, settings, {
    borrowerName: pa.borrowerName,
    propertyAddress: pa.propertyAddress,
    includeAgent,
    now: today,
    templateId,
    pronoun,
    paragraphs: parsedParagraphs.length ? parsedParagraphs : undefined,
    reLine,
    salutation,
    closing,
    title,
    dateText,
    showTerms,
    showValidity,
    expDays: parseInt(expDays, 10),
    showSubjectAddress,
  });

  const onTemplateChange = (id: string) => {
    setCustomized(false);
    setTemplateId(id);
  };
  const resetTemplate = () => setCustomized(false);
  const isClassic = styleId === 'classic';

  // Load the full borrower list once when connected; we filter it client-side so
  // the search dropdown is instant. (Re-fetches if provider/connection changes.)
  useEffect(() => {
    if (pa.source !== 'los' || !pa.losConnected) return;
    let cancelled = false;
    (async () => {
      try {
        const { results, mode } = await api.losSearch(pa.losProvider, '');
        if (!cancelled) {
          if (results) setLosResults(results);
          if (mode) setLosMode(mode);
        }
      } catch {
        if (!cancelled) setLosResults(STUB_BORROWERS);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pa.source, pa.losConnected, pa.losProvider]);

  // Filter the loaded borrowers by the search text — matches name, loan number,
  // and address, and is dash/space-insensitive so "LN20471" finds "Loan #LN-20471".
  const losMatches = useMemo(() => {
    const q = pa.losQuery.trim().toLowerCase();
    if (!q) return losResults;
    const qs = q.replace(/[-\s]/g, '');
    return losResults.filter((b) => {
      const hay = `${b.name} ${b.meta} ${b.address}`.toLowerCase();
      return hay.includes(q) || hay.replace(/[-\s]/g, '').includes(qs);
    });
  }, [losResults, pa.losQuery]);

  // Fetch (or generate) this user's inbound webhook URL. Surfaces loading/errors
  // instead of failing silently, and can be retried with the Refresh button.
  const loadWebhook = () => {
    setWebhookLoading(true);
    setWebhookError('');
    return api
      .losWebhookInfo()
      .then((info) => {
        setWebhookUrl(info.url);
        setWebhookCount(info.count);
      })
      .catch((err) => {
        setWebhookError(
          err instanceof ApiError && err.status === 401
            ? 'Your session expired — sign out and back in, then Refresh.'
            : 'Could not load your webhook URL. The server may be waking up (give it ~30s) — then Refresh.',
        );
      })
      .finally(() => setWebhookLoading(false));
  };

  useEffect(() => {
    if (pa.source !== 'los') return;
    loadWebhook();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pa.source]);

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const connect = async () => {
    try {
      const r = await api.losConnect(pa.losProvider);
      if (r?.mode) setLosMode(r.mode);
      set({ losConnected: true });
    } catch (err) {
      // A configured provider that can't be reached surfaces the error.
      if (err instanceof ApiError && err.status === 502) {
        alert(err.message);
        return;
      }
      setLosMode('demo');
      set({ losConnected: true });
    }
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
      style: styleId,
      showHeadshot,
      date: letter.date,
      title: letter.title,
      reLine: letter.reLine,
      subjectAddress: letter.subjectAddress,
      salutation: letter.salutation,
      paragraphs: letter.paragraphs,
      terms: letter.terms,
      validity: letter.validity,
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
      logo: settings.logoDataUrl || undefined,
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
      )}.\n\n${closing}\n${settings.name}`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  // --- shared letter body (used by both styles) ---
  const LetterBody = (
    <div className="flex-1 px-10 py-7 text-[#1b2733]" style={{ textAlign: isClassic ? 'left' : undefined }}>
      {letter.title && <div className="mb-3 text-center text-[16px] font-bold" style={{ color: GREEN }}>{letter.title}</div>}
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

      {letter.terms && (
        <div className="mt-4 rounded-[8px] bg-[#f4f6f9] px-5 py-3.5">
          {letter.terms.map((row) => (
            <div key={row.label} className="flex justify-between border-b border-[#e3e8ee] py-[6px] text-[12.5px] last:border-0">
              <span className="text-[#5b6b7b]">{row.label}</span>
              <span className="font-semibold text-[#0c2238]">{row.value}</span>
            </div>
          ))}
        </div>
      )}
      {letter.validity && <p className="mt-4 text-[13px] leading-[1.6] text-[#444]">{letter.validity}</p>}

      <div className="mt-7 text-[13.5px]">{letter.closing}</div>
      <div className="mt-1 text-[15px] font-bold" style={{ color: GREEN }}>
        {letter.officerName}
      </div>
      <div className="text-[12.5px] text-[#5b6b7b]">{letter.officerTitle}</div>
      {letter.partnerLine && <div className="mt-2 text-[12px] italic text-[#5b6b7b]">{letter.partnerLine}</div>}
    </div>
  );

  const contactLines: ReactNode = (
    <>
      <div className="font-semibold">
        {settings.phone}
        {settings.email ? `   ·   ${settings.email}` : ''}
      </div>
      <div>{settings.lenderAddress}</div>
      <div>{settings.lenderName}</div>
      <div style={{ color: GOLD }}>
        NMLS# {settings.lenderNmls || settings.nmls}
        {settings.website ? `   ·   ${settings.website}` : ''}
      </div>
    </>
  );

  return (
    <div className="animate-lp-fade">
      <PageHeader
        badge={<Badge tone="blue">Generator</Badge>}
        title="Pre-Approval Letter"
        subtitle="Pull a borrower, pick a program template and style, customize the wording, then generate a branded letter."
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
                options={scenarios.map((s, i) => ({ value: i, label: `${s.name || `Scenario ${i + 1}`} · ${computeScenario(s).typeLabel} · ${fmt(computeScenario(s).baseLoan)}` }))}
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

              {pa.losProvider === 'arive' && (
                <div className="mb-3.5 rounded-[10px] border border-border-input bg-input p-3.5">
                  <div className="text-[12.5px] font-semibold text-text-label">Connect Arive via Zapier</div>
                  <div className="mt-1 text-[11.5px] leading-[1.5] text-text-muted">
                    Arive has no public API, so push loans in with a Zap: <strong>Trigger</strong> = Arive (new/updated loan) →{' '}
                    <strong>Action</strong> = “Webhooks by Zapier” (POST) to the URL below. Map borrower name, property address,
                    loan #, and amount.
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      readOnly
                      value={webhookUrl}
                      placeholder={webhookLoading ? 'Generating your webhook URL…' : 'Click Refresh to generate your webhook URL'}
                      onFocus={(e) => e.currentTarget.select()}
                      className="num h-9 flex-1 rounded-[8px] border border-border-input bg-app px-2.5 text-[11.5px] text-text-soft outline-none placeholder:text-text-dim"
                    />
                    <Button variant="secondary" size="sm" onClick={copyWebhook} disabled={!webhookUrl}>
                      {copied ? 'Copied ✓' : 'Copy'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={loadWebhook} disabled={webhookLoading}>
                      {webhookLoading ? '…' : 'Refresh'}
                    </Button>
                  </div>
                  {webhookError ? (
                    <div className="mt-1.5 text-[11px] leading-[1.5] text-danger">{webhookError}</div>
                  ) : (
                    <div className="mt-1.5 text-[11px] text-text-dim">
                      {webhookCount} borrower{webhookCount === 1 ? '' : 's'} received so far.
                    </div>
                  )}
                </div>
              )}

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
                      <span className="font-medium text-text-muted">
                        · {losMode === 'live' ? 'Live' : losMode === 'zapier' ? 'Zapier' : 'Sandbox'}
                      </span>
                    </span>
                    <button onClick={disconnect} className="cursor-pointer border-none bg-transparent text-[12.5px] text-text-muted underline">
                      Disconnect
                    </button>
                  </div>
                  <div className="relative">
                    <TextField
                      className="!h-11 !text-[14px]"
                      placeholder="Search by name or loan #…"
                      value={pa.losQuery}
                      onChange={(e) => {
                        set({ losQuery: e.target.value });
                        setLosOpen(true);
                      }}
                      onFocus={() => setLosOpen(true)}
                      onBlur={() => window.setTimeout(() => setLosOpen(false), 150)}
                      aria-label="Search borrowers by name or loan number"
                    />
                    {losOpen && (
                      <div className="absolute left-0 right-0 z-20 mt-1 max-h-[264px] overflow-y-auto rounded-[10px] border border-border-input bg-elevated shadow-letter">
                        {losMatches.length === 0 ? (
                          <div className="px-3.5 py-3 text-[12.5px] text-text-muted">
                            {losResults.length === 0
                              ? 'No borrowers yet — they appear here once your Zap sends them in.'
                              : `No borrower matches “${pa.losQuery}”.`}
                          </div>
                        ) : (
                          losMatches.map((b, i) => (
                            <button
                              key={`${b.name}-${b.meta}-${i}`}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                set({ borrowerName: b.name, propertyAddress: b.address, losQuery: '' });
                                setLosOpen(false);
                              }}
                              className="flex w-full items-center justify-between gap-3 border-b border-[rgba(140,165,195,0.08)] px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-[rgba(47,128,237,0.12)]"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-[13.5px] font-semibold text-text-primary">{b.name}</span>
                                <span className="block truncate text-[12px] text-text-muted">
                                  {[b.meta, b.address].filter(Boolean).join(' · ')}
                                </span>
                              </span>
                              <span className="flex-none text-[12px] font-semibold text-brand-blue-light">Use →</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-[11.5px] text-text-dim">
                    {losResults.length} borrower{losResults.length === 1 ? '' : 's'} available
                    {losMode === 'demo' && ' · sample data until your Zap sends real loans'}
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
            </div>
            <div>
              <Label>Subject Property Address</Label>
              <TextField placeholder="205 Grand Avenue, Arco, ID 83213" value={pa.propertyAddress} onChange={(e) => set({ propertyAddress: e.target.value })} />
            </div>
          </div>

          {/* Program template + editable body */}
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel>PROGRAM TEMPLATE</SectionLabel>
              {customized && (
                <button onClick={resetTemplate} className="cursor-pointer border-none bg-transparent text-[12px] font-semibold text-brand-blue-light underline">
                  Reset to template
                </button>
              )}
            </div>
            <Select value={templateId} onChange={(e) => onTemplateChange(e.target.value)} options={LETTER_TEMPLATES.map((t) => ({ value: t.id, label: t.label }))} />
            <Label className="mt-3.5">Letter body (paragraphs separated by a blank line)</Label>
            <textarea
              value={bodyText}
              onChange={(e) => {
                setBodyText(e.target.value);
                setCustomized(true);
              }}
              rows={9}
              className="w-full resize-y rounded-[10px] border border-border-input bg-input p-3 text-[13px] leading-[1.6] text-text-primary outline-none transition-shadow focus:border-brand-blue focus:shadow-focus"
            />
          </div>

          {/* Letter options */}
          <Divider className="mb-5" />
          <SectionLabel className="mb-3">LETTER OPTIONS</SectionLabel>
          <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3.5">
            <div className="col-span-2">
              <Label>Letterhead style</Label>
              <Select value={styleId} onChange={(e) => setStyleId(e.target.value)} options={LETTERHEAD_STYLES.map((s) => ({ value: s.id, label: s.label }))} />
            </div>
            <div className="col-span-2">
              <Label>Letter title (optional heading)</Label>
              <TextField placeholder="e.g. Pre-Approval Letter (leave blank for none)" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>RE line</Label>
              <TextField placeholder={`Pre-Approval for ${pa.borrowerName || 'Borrower'}`} value={reLine} onChange={(e) => setReLine(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Salutation</Label>
              <TextField value={salutation} onChange={(e) => setSalutation(e.target.value)} />
              <PresetChips presets={SALUTATION_PRESETS} onPick={setSalutation} />
            </div>
            <div className="col-span-2">
              <Label>Closing</Label>
              <TextField value={closing} onChange={(e) => setClosing(e.target.value)} />
              <PresetChips presets={CLOSING_PRESETS} onPick={setClosing} />
            </div>
            <div className="col-span-2">
              <Label>Reference borrower as</Label>
              <SegmentedControl
                options={PRONOUN_OPTIONS}
                value={pronoun}
                onChange={(v) => setPronoun(v as PronounChoice)}
              />
              <div className="mt-1.5 text-[12px] text-text-muted">
                {srcScenario.borrowers === '2' ? 'Two borrowers always read as “they/them”.' : 'Sets he/him, she/her, or they/them in the letter wording.'}
              </div>
            </div>
            <div>
              <Label>Date</Label>
              <SegmentedControl
                size="sm"
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'custom', label: 'Set' },
                ]}
                value={dateMode}
                onChange={(v) => setDateMode(v as 'auto' | 'custom')}
              />
            </div>
            {dateMode === 'custom' && (
              <div>
                <Label>Pick date</Label>
                <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} className="field" />
              </div>
            )}
          </div>

          <div className="mb-4 flex flex-col gap-2.5">
            <Toggle checked={showSubjectAddress} onChange={setShowSubjectAddress} label="Show subject property address" />
            <Toggle checked={showTerms} onChange={setShowTerms} label="Show loan terms table" hint="Type, price, loan amount, down, rate, term" />
            <div>
              <Toggle checked={showValidity} onChange={setShowValidity} label="Show validity / expiration line" />
              {showValidity && (
                <div className="mt-2">
                  <Select
                    value={expDays}
                    onChange={(e) => setExpDays(e.target.value)}
                    options={[
                      { value: '30', label: 'Valid for 30 days' },
                      { value: '60', label: 'Valid for 60 days' },
                      { value: '90', label: 'Valid for 90 days' },
                    ]}
                  />
                </div>
              )}
            </div>
            <Toggle checked={showHeadshot} onChange={setShowHeadshot} label="Show photo in footer" />
            <div className="flex items-center justify-between rounded-[10px] border border-border-input bg-input px-3.5 py-2.5">
              <div className="pr-3">
                <div className="text-[13px] font-semibold text-text-label">Dual branding (real-estate agent)</div>
                <div className="text-[11.5px] text-text-muted">
                  {hasAgent ? (
                    <>Co-brand with {settings.agentName}</>
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
              The letterhead, signature, and contact footer come from Settings. Arive borrowers arrive via a Zapier webhook
              (the URL above) — until your Zap sends data, the list shows sandbox borrowers. PDF is generated by the backend.
            </StubNote>
          </div>
        </Card>

        {/* RIGHT — live preview */}
        <div className="sticky top-5">
          <div className="rounded-2xl bg-[#eef1f5] p-1.5 shadow-letter">
            <div className="flex min-h-[660px] flex-col overflow-hidden rounded-[11px] bg-white" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
              {/* Letterhead */}
              <div className={`px-10 pt-9 ${isClassic ? 'flex flex-col items-center' : ''}`}>
                <img src={settings.logoDataUrl || '/brand/letterhead-logo.jpg'} alt={settings.lenderName || settings.company || 'Company logo'} className="h-[58px] w-auto" />
                <div className="mt-4 h-[3px] w-full rounded" style={{ background: GOLD }} />
              </div>

              {LetterBody}

              {/* Footer */}
              {isClassic ? (
                <div className="mt-auto px-10 pb-7 pt-4 text-center" style={{ borderTop: `3px solid ${GOLD}` }}>
                  {showHeadshot && (
                    <img src="/brand/officer-headshot.png" alt={settings.name} className="mx-auto mb-2 h-[54px] w-[54px] rounded-full border-2 object-cover object-top" style={{ borderColor: GOLD }} />
                  )}
                  <div className="text-[11.5px] leading-[1.55]" style={{ color: GREEN }}>
                    {contactLines}
                  </div>
                </div>
              ) : (
                <div className="mt-auto" style={{ background: GREEN, borderTop: `4px solid ${GOLD}` }}>
                  <div className="flex items-center gap-4 px-9 py-5">
                    {showHeadshot && (
                      <img src="/brand/officer-headshot.png" alt={settings.name} className="h-[62px] w-[62px] flex-shrink-0 rounded-full border-2 object-cover object-top" style={{ borderColor: GOLD }} />
                    )}
                    <div className="text-[11.5px] leading-[1.5] text-white">{contactLines}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
