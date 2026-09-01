import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge, StubNote } from '@/components/ui/Badge';
import { Card, SectionLabel, Divider } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { TextField, Label } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { SignaturePad } from '@/components/SignaturePad';
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
import { rankBorrowers } from '@/lib/borrowerSearch';
import { parseMismo } from '@/lib/mismo';
import type { MismoResult } from '@/lib/mismo';
import { groupByBorrower, diffRecords } from '@/lib/preApprovalHistory';
import type { PreApprovalRecord, PreApprovalState, Scenario } from '@/types';
import { losBorrowerToScenario } from '@/lib/losBorrower';

// Summit Home Loans brand palette (navy + steel accent).
const GREEN = '#13355f'; // primary navy (headings, officer name, footer band)
const GOLD = '#5f7fa8'; // steel-blue accent (bars, borders, NMLS line)

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
  // Extra details pushed in from the LOS/Zap, surfaced in the search results.
  amount?: string;
  phone?: string;
  email?: string;
  loanType?: string;
  purpose?: string;
  rate?: string;
}


// No hardcoded sample borrowers — the LOS list shows ONLY real loans pushed in
// from Zapier, so nothing fake ever appears in the pipeline.
const STUB_BORROWERS: Borrower[] = [];

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
  const { settings, save: saveSettings, saving: savingSettings } = useSettings();
  const { openSettings } = useUI();
  const [pa, setPa] = useState<PreApprovalState>({
    source: 'scenario',
    scenarioIdx: 0,
    losProvider: 'arive',
    losConnected: false,
    losQuery: '',
    borrowerName: 'John Smith',
    propertyAddress: '123 Main Street, Anytown, ST 00000',
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
  const [imported, setImported] = useState<MismoResult | null>(null);
  const [importError, setImportError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [activityLog, setActivityLog] = useState<
    { at: string; recordsReceived: number; borrowersStored: number; fieldNames: string[]; extractedNames: string[]; sample: string }[]
  >([]);
  const [showActivity, setShowActivity] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [view, setView] = useState<'create' | 'issued'>('create');
  const [history, setHistory] = useState<PreApprovalRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  // Inline status banner for the action area (replaces jarring native alerts).
  const [actionMsg, setActionMsg] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  // Loan terms captured from a selected LOS borrower (drives the letter math), plus
  // which fields actually came from the feed (for the disclosure banner).
  const [losScenario, setLosScenario] = useState<Scenario | null>(null);
  const [losFeedFields, setLosFeedFields] = useState<string[]>([]);
  const [losPicked, setLosPicked] = useState(false);
  const set = (patch: Partial<PreApprovalState>) => setPa((s) => ({ ...s, ...patch }));

  const loadHistory = () => {
    setHistoryLoading(true);
    setHistoryError('');
    return api
      .preApprovalHistory()
      .then(({ history: h }) => setHistory(h || []))
      .catch(() => setHistoryError('Could not load issued pre-approvals. The server may be waking up — try Refresh.'))
      .finally(() => setHistoryLoading(false));
  };
  // Load history the first time the Issued tab is opened.
  useEffect(() => {
    if (view === 'issued' && !history.length && !historyError) loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Letter loan terms come from: an imported MISMO file, else a selected LOS
  // borrower's feed data, else the chosen saved scenario.
  const srcScenario =
    pa.source === 'import' && imported
      ? imported.scenario
      : pa.source === 'los' && losScenario
        ? losScenario
        : scenarios[Math.min(pa.scenarioIdx, scenarios.length - 1)] || scenarios[0];

  // Read a MISMO 3.4 XML file entirely in the browser (borrower PII never leaves the
  // device) and pull the borrower, property, and loan terms into the letter.
  const onMismoFile = (file: File | undefined) => {
    if (!file) return;
    setImportError('');
    const reader = new FileReader();
    reader.onerror = () => setImportError('Could not read that file. Try again.');
    reader.onload = () => {
      try {
        const result = parseMismo(String(reader.result || ''));
        if (!result) {
          setImportError('That doesn’t look like a MISMO 3.4 loan file — no borrower or loan amount found.');
          return;
        }
        setImported(result);
        set({ borrowerName: result.borrowerName || '', propertyAddress: result.propertyAddress || '' });
      } catch {
        setImportError('Couldn’t parse that file. Make sure it’s a MISMO 3.4 XML export.');
      }
    };
    reader.readAsText(file);
  };
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

  // Signature: seeded from the saved settings signature until the user draws/uploads
  // one here (sigTouched), so a signature set once auto-fills every letter.
  const [signature, setSignature] = useState('');
  const [sigTouched, setSigTouched] = useState(false);
  const [showSignature, setShowSignature] = useState(true);
  const [sigSaved, setSigSaved] = useState(false);
  useEffect(() => {
    if (!sigTouched && settings.signatureDataUrl) setSignature(settings.signatureDataUrl);
  }, [settings.signatureDataUrl, sigTouched]);
  const onSignatureChange = (dataUrl: string) => {
    setSigTouched(true);
    setSigSaved(false);
    setSignature(dataUrl);
  };
  const saveSignatureToSettings = async () => {
    await saveSettings({ signatureDataUrl: signature });
    setSigSaved(true);
    window.setTimeout(() => setSigSaved(false), 2000);
  };
  const sigMatchesSaved = signature === (settings.signatureDataUrl || '');

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

  // Rank the loaded borrowers against the search text: empty shows everyone, and as
  // you type it narrows to the closest names first — order-independent across words,
  // dash/space-insensitive for loan numbers, and typo-tolerant (see borrowerSearch).
  const losMatches = useMemo(() => rankBorrowers(losResults, pa.losQuery), [losResults, pa.losQuery]);

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

  const loadActivity = () => {
    setActivityLoading(true);
    api
      .losWebhookLog()
      .then(({ log }) => setActivityLog(log || []))
      .catch(() => {})
      .finally(() => setActivityLoading(false));
  };
  const toggleActivity = () => {
    const next = !showActivity;
    setShowActivity(next);
    if (next) loadActivity();
  };

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
        setActionMsg({ tone: 'error', text: err.message });
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
    setActionMsg(null);
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
      signature: showSignature && signature ? signature : undefined,
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
      // Structured loan snapshot recorded in the issued-pre-approvals history.
      loan: {
        propertyAddress: pa.propertyAddress,
        loanType: computeScenario(srcScenario).typeLabel,
        transaction: srcScenario.transaction,
        price: srcScenario.homePrice,
        loanAmount: computeScenario(srcScenario).baseLoan,
        downPayment: srcScenario.downPayment,
        rate: srcScenario.rate,
        term: srcScenario.term,
        monthlyPayment: computeScenario(srcScenario).totalMonthly,
        apr: computeScenario(srcScenario).apr,
        validityDays: parseInt(expDays, 10) || 0,
      },
    };
    try {
      const blob = await api.preApprovalPdf(payload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `preapproval-${(pa.borrowerName || 'letter').split(' ').pop()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      // Refresh history so the just-issued letter shows in the Issued tab.
      setActionMsg(null);
      loadHistory();
    } catch {
      setActionMsg({
        tone: 'info',
        text: 'The letter service is waking up — this can take up to ~30 seconds on the first request. Opening your browser’s print dialog as a fallback; try Download PDF again in a moment.',
      });
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
      {showSignature && signature && (
        <img src={signature} alt={`${letter.officerName} signature`} className="mt-1.5 h-[52px] w-auto max-w-[240px] object-contain object-left" />
      )}
      <div className={`text-[15px] font-bold ${showSignature && signature ? 'mt-0.5' : 'mt-1'}`} style={{ color: GREEN }}>
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

      <SegmentedControl
        className="mb-6 max-w-[440px]"
        options={[
          { value: 'create', label: 'Create Letter' },
          { value: 'issued', label: history.length ? `Issued (${history.length})` : 'Issued' },
        ]}
        value={view}
        onChange={(v) => setView(v as 'create' | 'issued')}
      />

      {view === 'issued' && (
        <IssuedPreApprovals history={history} loading={historyLoading} error={historyError} onRefresh={loadHistory} />
      )}

      <div className={view === 'create' ? 'grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_1.05fr]' : 'hidden'}>
        {/* LEFT — form */}
        <Card className="p-6">
          <SectionLabel className="mb-3">DATA SOURCE</SectionLabel>
          <SegmentedControl
            className="mb-[22px]"
            options={[
              { value: 'scenario', label: 'From a Scenario' },
              { value: 'los', label: 'From your LOS' },
              { value: 'import', label: 'Import a file' },
            ]}
            value={pa.source}
            onChange={(v) => {
              // Switching source clears any LOS-derived loan terms so they don't leak
              // into a scenario/import letter.
              setLosScenario(null);
              setLosFeedFields([]);
              setLosPicked(false);
              set({ source: v as PreApprovalState['source'] });
            }}
          />

          {pa.source === 'import' && (
            <div className="mb-[22px]">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!dragging) setDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  onMismoFile(e.dataTransfer.files?.[0]);
                }}
                className={`rounded-xl border border-dashed p-[18px] transition-colors ${
                  dragging ? 'border-brand-teal bg-[rgba(45,212,191,0.08)]' : 'border-[#2f4663] bg-input'
                }`}
              >
                <div className="text-[13.5px] font-semibold text-text-soft">Import a MISMO 3.4 loan file</div>
                <p className="mt-1 text-[12px] leading-[1.5] text-text-muted">
                  Works without Zapier — export the loan as a MISMO 3.4 (.xml) file from Arive (or any LOS), then{' '}
                  <strong>drag it onto this box</strong> or use the button below. The borrower, property, loan amount, rate, and
                  term fill in automatically. Your file is read on this device and never uploaded.
                </p>
                <label className="mt-3 inline-flex cursor-pointer">
                  <input
                    type="file"
                    accept=".xml,text/xml,application/xml"
                    className="hidden"
                    onChange={(e) => {
                      onMismoFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <span className="inline-flex h-[42px] items-center rounded-[10px] border border-border bg-elevated px-4 text-[13.5px] font-semibold text-text-primary transition-colors hover:border-brand-teal">
                    {dragging ? 'Drop to import…' : 'Choose MISMO file…'}
                  </span>
                </label>

                {importError ? (
                  <div className="mt-3 rounded-[10px] border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.1)] px-3.5 py-2.5 text-[12.5px] text-danger">
                    {importError}
                  </div>
                ) : imported ? (
                  <div className="mt-3 rounded-[10px] border border-[rgba(52,211,153,0.28)] bg-[rgba(52,211,153,0.1)] px-3.5 py-2.5 text-[12.5px] text-good">
                    <span className="font-semibold">Imported ✓</span> {imported.summary}
                    {imported.loanNumber ? ` · Loan #${imported.loanNumber}` : ''}
                    <div className="mt-0.5 text-[11.5px] text-text-muted">
                      Edit any field below before generating the letter.
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

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
                  <div className="text-[12.5px] font-semibold text-text-label">Shared team pipeline · one Zap for everyone</div>
                  <div className="mt-1 text-[11.5px] leading-[1.5] text-text-muted">
                    This is a <strong>shared</strong> feed: one Zap sends loans in, and everyone on your team sees them here — so
                    teammates don’t set up anything, they just search below. <strong>Set it up once:</strong> in Zapier,{' '}
                    <strong>Trigger</strong> = Arive (new/updated loan) → <strong>Action</strong> = “Webhooks by Zapier” (POST) to
                    the shared URL below. Map borrower name, property address, loan #, and amount. (The URL is the same for every
                    account.)
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      readOnly
                      value={webhookUrl}
                      placeholder={webhookLoading ? 'Loading the shared webhook URL…' : 'Click Refresh to load the shared webhook URL'}
                      onFocus={(e) => e.currentTarget.select()}
                      className="num h-9 flex-1 rounded-[8px] border border-border-input bg-app px-2.5 text-[11.5px] text-text-soft outline-none placeholder:text-text-dim"
                      aria-label="Shared team webhook URL"
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
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-text-dim">
                      <span>
                        {webhookCount} borrower{webhookCount === 1 ? '' : 's'} in the shared pipeline · same feed for your whole team.
                      </span>
                      <button
                        type="button"
                        onClick={toggleActivity}
                        className="flex-none cursor-pointer border-none bg-transparent font-semibold text-brand-blue-light underline"
                      >
                        {showActivity ? 'Hide activity' : 'See what Zapier sent'}
                      </button>
                    </div>
                  )}

                  {showActivity && (
                    <div className="mt-2 rounded-[9px] border border-border-input bg-app p-2.5">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11.5px] font-semibold text-text-soft">Recent webhook activity</span>
                        <button
                          type="button"
                          onClick={loadActivity}
                          className="cursor-pointer border-none bg-transparent text-[11px] text-brand-blue-light underline"
                        >
                          {activityLoading ? '…' : 'Refresh'}
                        </button>
                      </div>
                      {activityLog.length === 0 ? (
                        <div className="py-1 text-[11px] text-text-muted">
                          {activityLoading ? 'Loading…' : 'No sends recorded yet. Trigger your Zap (or hit “Test” in Zapier) and refresh.'}
                        </div>
                      ) : (
                        <div className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto">
                          {activityLog.map((e, i) => (
                            <div key={i} className="rounded-[7px] bg-input px-2.5 py-1.5 text-[11px] leading-[1.5]">
                              <div className="flex items-center justify-between text-text-soft">
                                <span>{new Date(e.at).toLocaleString()}</span>
                                <span className={e.borrowersStored ? 'text-good' : 'text-[#fbbf24]'}>
                                  {e.recordsReceived} sent · {e.borrowersStored} added
                                </span>
                              </div>
                              {e.extractedNames?.length > 0 && (
                                <div className="mt-0.5 text-text-muted">Names: {e.extractedNames.join(', ')}</div>
                              )}
                              <div className="mt-0.5 text-text-dim">Fields seen: {e.fieldNames?.join(', ') || '—'}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-1.5 text-[10.5px] leading-[1.5] text-text-dim">
                        If a send shows “0 added”, your Zap didn’t include a recognizable borrower name — check the field mapping.
                      </div>
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
                  <div
                    className={`mb-3 flex items-center justify-between rounded-[10px] border px-3.5 py-2.5 ${
                      losMode === 'demo'
                        ? 'border-[rgba(251,191,36,0.28)] bg-[rgba(251,191,36,0.1)]'
                        : 'border-[rgba(52,211,153,0.25)] bg-[rgba(52,211,153,0.1)]'
                    }`}
                  >
                    <span className={`flex items-center gap-2 text-[13px] font-semibold ${losMode === 'demo' ? 'text-[#fbbf24]' : 'text-good'}`}>
                      <span className={`h-2 w-2 rounded-full ${losMode === 'demo' ? 'bg-[#fbbf24]' : 'bg-good'}`} />
                      {losMode === 'demo' ? 'Sandbox' : 'Live'}
                      <span className="font-medium text-text-muted">
                        · {losMode === 'live' ? 'Direct API' : losMode === 'zapier' ? 'Zapier (real loans)' : 'no loans received yet'}
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
                          losMatches.map((b, i) => {
                            const loanFacts = [b.loanType, b.purpose, b.rate].filter(Boolean) as string[];
                            const contacts = [b.phone, b.email].filter(Boolean) as string[];
                            return (
                              <button
                                key={`${b.name}-${b.meta}-${i}`}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  // Carry the feed's loan terms into the letter math (not just name/address),
                                  // using the currently-selected saved scenario for anything the feed omits.
                                  const base = scenarios[Math.min(pa.scenarioIdx, scenarios.length - 1)] || scenarios[0];
                                  const built = base ? losBorrowerToScenario(b, base) : null;
                                  setLosScenario(built?.scenario ?? null);
                                  setLosFeedFields(built?.fromFeed ?? []);
                                  setLosPicked(true);
                                  set({ borrowerName: b.name, propertyAddress: b.address, losQuery: '' });
                                  setLosOpen(false);
                                }}
                                className="flex w-full items-start justify-between gap-3 border-b border-[rgba(140,165,195,0.08)] px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-[rgba(47,128,237,0.12)]"
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13.5px] font-semibold text-text-primary">{b.name}</span>
                                  {(b.meta || b.address) && (
                                    <span className="block truncate text-[12px] text-text-muted">
                                      {[b.meta, b.address].filter(Boolean).join(' · ')}
                                    </span>
                                  )}
                                  {(loanFacts.length > 0 || contacts.length > 0) && (
                                    <span className="mt-1 flex flex-wrap items-center gap-1">
                                      {loanFacts.map((d) => (
                                        <span
                                          key={`f-${d}`}
                                          className="rounded-full bg-[rgba(47,128,237,0.12)] px-2 py-0.5 text-[10.5px] font-semibold text-brand-blue-light"
                                        >
                                          {d}
                                        </span>
                                      ))}
                                      {contacts.map((c) => (
                                        <span
                                          key={`c-${c}`}
                                          className="max-w-[160px] truncate rounded-full border border-border-seg px-2 py-0.5 text-[10.5px] text-text-soft"
                                        >
                                          {c}
                                        </span>
                                      ))}
                                    </span>
                                  )}
                                </span>
                                <span className="mt-0.5 flex-none text-[12px] font-semibold text-brand-blue-light">Use →</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-[11.5px] text-text-dim">
                    {losMode === 'demo'
                      ? 'Waiting for your first loan — send one from your Zap (or hit “Test” in Zapier) and it appears here instantly.'
                      : `${losResults.length} borrower${losResults.length === 1 ? '' : 's'} in your team’s shared pipeline.`}
                  </div>

                  {/* Disclose which loan terms drive the letter after a borrower is picked. */}
                  {losPicked && losScenario && losFeedFields.length > 0 && (
                    <div className="mt-3 rounded-[10px] border border-[rgba(52,211,153,0.28)] bg-[rgba(52,211,153,0.1)] px-3.5 py-2.5 text-[12px] leading-[1.55] text-good">
                      <span className="font-semibold">Letter terms pulled from your LOS:</span> {losFeedFields.join(' · ')}.
                      <div className="mt-0.5 text-[11px] text-text-muted">
                        Purchase price, down payment, and term aren’t in the feed — the loan amount is used as-is. Confirm the numbers below before sending.
                      </div>
                    </div>
                  )}
                  {losPicked && !losScenario && (
                    <div className="mt-3 rounded-[10px] border border-[rgba(251,191,36,0.28)] bg-[rgba(251,191,36,0.1)] px-3.5 py-2.5 text-[12px] leading-[1.55] text-warn-text">
                      This borrower’s feed didn’t include loan details, so the letter falls back to a saved scenario’s terms. Confirm them before sending.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <Divider className="mb-5" />
          <div className="mb-5 flex flex-col gap-4">
            <div>
              <Label>Borrower Name(s)</Label>
              <TextField placeholder="Borrower's full name" value={pa.borrowerName} onChange={(e) => set({ borrowerName: e.target.value })} />
            </div>
            <div>
              <Label>Subject Property Address</Label>
              <TextField placeholder="Property address" value={pa.propertyAddress} onChange={(e) => set({ propertyAddress: e.target.value })} />
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

          {/* Signature */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel>SIGNATURE</SectionLabel>
              {signature && !sigMatchesSaved && (
                <button
                  onClick={saveSignatureToSettings}
                  disabled={savingSettings}
                  className="cursor-pointer border-none bg-transparent text-[12px] font-semibold text-brand-blue-light underline disabled:opacity-50"
                >
                  {savingSettings ? 'Saving…' : sigSaved ? 'Saved ✓' : 'Save to Settings'}
                </button>
              )}
              {signature && sigMatchesSaved && <span className="text-[11.5px] text-text-dim">Saved to Settings</span>}
            </div>
            <SignaturePad value={signature} onChange={onSignatureChange} defaultName={settings.name} />
            <div className="mt-1.5 text-[11.5px] text-text-muted">
              Appears above your name in the letter. Save it once and it auto-fills every future letter.
            </div>
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
            <Toggle
              checked={showSignature}
              onChange={setShowSignature}
              label="Show signature"
              hint={signature ? 'Handwritten signature above your name' : 'Add one in the Signature section above'}
            />
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

          {actionMsg && (
            <div
              className={`mb-3 rounded-[10px] border px-3.5 py-2.5 text-[12.5px] leading-[1.5] ${
                actionMsg.tone === 'error'
                  ? 'border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.1)] text-danger'
                  : 'border-[rgba(251,191,36,0.28)] bg-[rgba(251,191,36,0.1)] text-warn-text'
              }`}
              role="status"
            >
              {actionMsg.text}
            </div>
          )}
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

// Issued-pre-approvals history: grouped by borrower, each with the loan summary and
// what changed between successive letters.
function IssuedPreApprovals({
  history,
  loading,
  error,
  onRefresh,
}: {
  history: PreApprovalRecord[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const groups = useMemo(() => groupByBorrower(history), [history]);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const summary = (r: PreApprovalRecord) =>
    [r.loanType, r.loanAmount ? fmt(r.loanAmount) : '', r.rate ? `${r.rate}%` : '', r.term ? `${r.term} yr` : '', r.transaction]
      .filter(Boolean)
      .join(' · ');

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-[22px] py-4">
        <div>
          <div className="text-[15px] font-semibold text-text-heading">Issued Pre-Approvals</div>
          <div className="text-[12.5px] text-text-muted">Every letter you generate — grouped by borrower, with what changed each time.</div>
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      {error ? (
        <div className="px-[22px] py-6 text-[13.5px] text-danger">{error}</div>
      ) : !groups.length ? (
        <div className="px-[22px] py-10 text-center text-[13.5px] text-text-muted">
          {loading ? 'Loading…' : 'No pre-approvals issued yet. Generate a letter and it will be logged here, tied to the borrower.'}
        </div>
      ) : (
        <div className="flex flex-col">
          {groups.map((g) => {
            const isOpen = openKey === g.key;
            return (
              <div key={g.key} className="border-b border-border last:border-0">
                <button
                  onClick={() => setOpenKey(isOpen ? null : g.key)}
                  className="flex w-full items-center justify-between gap-3 px-[22px] py-4 text-left transition-colors hover:bg-[rgba(47,128,237,0.06)]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14.5px] font-semibold text-text-primary">{g.borrowerName}</span>
                      <span className="rounded-full bg-[rgba(47,128,237,0.14)] px-2 py-0.5 text-[11px] font-semibold text-brand-blue-light">
                        {g.count} letter{g.count === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[12.5px] text-text-muted">
                      {summary(g.latest)}
                      {g.latest.propertyAddress ? ` · ${g.latest.propertyAddress}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-none items-center gap-3">
                    <span className="text-[12px] text-text-dim">{fmtDate(g.latest.issuedAt)}</span>
                    <span className="text-[12px] text-text-muted">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="bg-[rgba(140,165,195,0.04)] px-[22px] pb-4 pt-1">
                    {g.records.map((r, i) => {
                      const older = g.records[i + 1]; // newest-first, so i+1 is the previous letter
                      const changes = diffRecords(r, older);
                      return (
                        <div key={r.id} className="border-l-2 border-[rgba(45,212,191,0.4)] py-2 pl-3.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12.5px] font-semibold text-text-soft">
                              {i === 0 ? 'Latest' : `Version ${g.records.length - i}`} · {fmtDate(r.issuedAt)}
                            </span>
                            <span className="num text-[12.5px] text-text-muted">{r.monthlyPayment ? `${fmt(r.monthlyPayment)}/mo` : ''}</span>
                          </div>
                          <div className="mt-0.5 text-[12px] text-text-muted">{summary(r)}</div>
                          {changes.length > 0 ? (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {changes.map((c) => (
                                <span key={c.label} className="rounded-[6px] bg-[rgba(251,191,36,0.14)] px-2 py-0.5 text-[11px] text-[#d9a53a]">
                                  {c.label}: {c.from} → {c.to}
                                </span>
                              ))}
                            </div>
                          ) : (
                            older && <div className="mt-1 text-[11px] text-text-dim">No changes from the prior letter.</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
