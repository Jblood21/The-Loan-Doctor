import { useState } from 'react';
import { useUI } from '@/context/UIContext';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from './ui/Button';
import { TextField, Label } from './ui/TextField';
import { ClosingCostsEditor, cloneFees } from './ClosingCostsEditor';
import { defaultClosingCosts } from '@/lib/finance';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { initials } from '@/lib/format';
import type { ChangeEvent } from 'react';
import type { Settings } from '@/types';

interface Field {
  key: keyof Settings;
  label: string;
  ph: string;
  type?: 'text' | 'number';
}
interface Section {
  title: string;
  note: string;
  cta: string;
  fields: Field[];
}

const SECTIONS: Section[] = [
  {
    title: 'My Account',
    note: 'Your info for documents and contact details.',
    cta: 'Save Loan Officer Info',
    fields: [
      { key: 'name', label: 'Your Name', ph: 'Alan Blood' },
      { key: 'officerTitle', label: 'Title', ph: 'Mortgage Specialist' },
      { key: 'company', label: 'Company', ph: 'Summit Home Loans' },
      { key: 'email', label: 'Email', ph: 'you@summithomeloans.com' },
      { key: 'phone', label: 'Phone', ph: '801-855-8535' },
      { key: 'nmls', label: 'NMLS #', ph: '103895' },
    ],
  },
  {
    title: 'Lender Information',
    note: "Your institution's details for branding.",
    cta: 'Save Lender Info',
    fields: [
      { key: 'lenderName', label: 'Lender Name', ph: 'Summit Home Loans' },
      { key: 'lenderNmls', label: 'Lender NMLS #', ph: '1790749' },
      { key: 'website', label: 'Website', ph: 'summithomeloans.com' },
      { key: 'lenderAddress', label: 'Address', ph: '123 Main St, Suite 100 · City, ST' },
      { key: 'lenderPhone', label: 'Lender Phone', ph: '(800) 555-1234' },
    ],
  },
];

export function SettingsDrawer() {
  const { settingsOpen, closeSettings } = useUI();
  const { settings, update, save, saving } = useSettings();
  const { user } = useAuth();

  const [agentForm, setAgentForm] = useState({ name: '', brokerage: '', phone: '', email: '' });
  const { installed, promptInstall } = useInstallPrompt();
  const [installMsg, setInstallMsg] = useState('');

  if (!settingsOpen) return null;

  const name = settings.name || user?.name || 'Loan Officer';

  // Saved real-estate-agent contacts (add / delete). Selected for a letter on the
  // Pre-Approval page.
  const agents = settings.agents ?? [];
  const newId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const addAgent = () => {
    const agentName = agentForm.name.trim();
    if (!agentName) return;
    save({
      agents: [
        ...agents,
        {
          id: newId(),
          name: agentName,
          brokerage: agentForm.brokerage.trim(),
          phone: agentForm.phone.trim(),
          email: agentForm.email.trim() || undefined,
        },
      ],
    });
    setAgentForm({ name: '', brokerage: '', phone: '', email: '' });
  };
  const deleteAgent = (id: string) => save({ agents: agents.filter((a) => a.id !== id) });

  // Read an uploaded image, downscale it to a letterhead-friendly size, and save it
  // as a data URL. PNG keeps transparency; falls back to JPEG if the file is large.
  const onLogoFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 400;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        let dataUrl = canvas.toDataURL('image/png');
        if (dataUrl.length > 800000) dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        save({ logoDataUrl: dataUrl });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <div onClick={closeSettings} className="fixed inset-0 z-40 bg-[rgba(4,9,15,0.6)] backdrop-blur-[2px]" />
      <div className="fixed bottom-0 right-0 top-0 z-[41] w-[440px] max-w-[92vw] animate-lp-fade overflow-y-auto border-l border-border bg-sidebar shadow-slideover">
        <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-border bg-sidebar px-6 py-[22px]">
          <h2 className="m-0 font-display text-[20px] font-semibold">Settings</h2>
          <button
            onClick={closeSettings}
            aria-label="Close settings"
            className="h-[34px] w-[34px] cursor-pointer rounded-[9px] border-none bg-[rgba(140,165,195,0.08)] text-[20px] text-text-soft transition-colors hover:bg-[rgba(248,113,113,0.12)] hover:text-danger"
          >
            ×
          </button>
        </div>

        <div className="p-6">
          <div className="mb-[22px] flex items-center gap-[14px] rounded-xl border border-border bg-elevated px-4 py-[14px]">
            <div className="flex h-11 w-11 items-center justify-center rounded-[11px] bg-brand-gradient text-[16px] font-bold text-app">
              {initials(name)}
            </div>
            <div>
              <div className="text-[14.5px] font-semibold">{name}</div>
              <div className="text-[12.5px] text-text-muted">
                NMLS #{settings.nmls || '—'} · {settings.company || '—'}
              </div>
            </div>
          </div>

          {SECTIONS.map((sec) => (
            <div key={sec.title} className="mb-6">
              <div className="mb-1 text-[14px] font-bold text-text-primary">{sec.title}</div>
              <div className="mb-[14px] text-[12.5px] text-text-muted">{sec.note}</div>
              <div className="flex flex-col gap-3">
                {sec.fields.map((f) => (
                  <div key={String(f.key)}>
                    <Label className="!mb-1.5 !text-[12.5px] !text-text-soft">{f.label}</Label>
                    <TextField
                      type={f.type ?? 'text'}
                      placeholder={f.ph}
                      value={(settings[f.key] as string | number) ?? ''}
                      onChange={(e) =>
                        update({
                          [f.key]: f.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value,
                        } as Partial<Settings>)
                      }
                      className="!h-[42px] !text-[14px]"
                    />
                  </div>
                ))}
              </div>
              <Button variant="primary" size="md" className="mt-[14px]" disabled={saving} onClick={() => save()}>
                {saving ? 'Saving…' : sec.cta}
              </Button>
            </div>
          ))}

          {/* Real-estate agent contacts — saved here, selectable on the Pre-Approval page */}
          <div className="mb-6">
            <div className="mb-1 text-[14px] font-bold text-text-primary">Real-Estate Agents</div>
            <div className="mb-[14px] text-[12.5px] text-text-muted">
              Save agents to co-brand pre-approval letters. Pick one from the dropdown on the Pre-Approval page.
            </div>

            {agents.length > 0 ? (
              <div className="mb-3 flex flex-col gap-2">
                {agents.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-elevated px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold text-text-primary">{a.name}</div>
                      <div className="truncate text-[12px] text-text-muted">
                        {[a.brokerage, a.phone, a.email].filter(Boolean).join(' · ') || 'No details'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteAgent(a.id)}
                      aria-label={`Delete ${a.name}`}
                      className="flex-shrink-0 cursor-pointer border-none bg-transparent text-[12.5px] font-semibold text-text-muted underline hover:text-danger"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mb-3 rounded-[10px] border border-dashed border-border-input px-3.5 py-3 text-[12.5px] text-text-muted">
                No agents saved yet — add one below.
              </div>
            )}

            <div className="flex flex-col gap-2 rounded-[10px] border border-border-input bg-input p-3">
              <div className="grid grid-cols-2 gap-2">
                <TextField
                  placeholder="Agent name"
                  value={agentForm.name}
                  onChange={(e) => setAgentForm((f) => ({ ...f, name: e.target.value }))}
                  className="!h-[40px] !text-[13.5px]"
                />
                <TextField
                  placeholder="Brokerage"
                  value={agentForm.brokerage}
                  onChange={(e) => setAgentForm((f) => ({ ...f, brokerage: e.target.value }))}
                  className="!h-[40px] !text-[13.5px]"
                />
                <TextField
                  placeholder="Phone"
                  value={agentForm.phone}
                  onChange={(e) => setAgentForm((f) => ({ ...f, phone: e.target.value }))}
                  className="!h-[40px] !text-[13.5px]"
                />
                <TextField
                  placeholder="Email (optional)"
                  value={agentForm.email}
                  onChange={(e) => setAgentForm((f) => ({ ...f, email: e.target.value }))}
                  className="!h-[40px] !text-[13.5px]"
                />
              </div>
              <Button
                variant="secondary"
                size="md"
                className="mt-1 self-start"
                disabled={saving || !agentForm.name.trim()}
                onClick={addAgent}
              >
                {saving ? 'Saving…' : 'Add Agent'}
              </Button>
            </div>
          </div>

          <div className="mb-6">
            <div className="mb-1 text-[14px] font-bold text-text-primary">Letterhead Logo</div>
            <div className="mb-[14px] text-[12.5px] text-text-muted">
              Upload your own logo for pre-approval letters. Leave empty to use the built-in letterhead.
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-[64px] w-[150px] items-center justify-center overflow-hidden rounded-[10px] border border-border bg-[#eef1f5] px-2">
                <img
                  src={settings.logoDataUrl || '/brand/letterhead-logo.jpg'}
                  alt="Letterhead logo preview"
                  className="max-h-[52px] max-w-full object-contain"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="cursor-pointer">
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={onLogoFile} className="hidden" />
                  <span className="inline-flex h-[36px] items-center rounded-[9px] border border-border bg-elevated px-3.5 text-[13px] font-semibold text-text-primary transition-colors hover:border-brand-teal">
                    Upload logo
                  </span>
                </label>
                {settings.logoDataUrl && (
                  <button
                    type="button"
                    onClick={() => save({ logoDataUrl: '' })}
                    className="cursor-pointer border-none bg-transparent text-left text-[12.5px] text-text-muted underline hover:text-danger"
                  >
                    Remove custom logo
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mb-6">
            <div className="mb-1 text-[14px] font-bold text-text-primary">Default Closing Costs</div>
            <div className="mb-1 text-[12.5px] text-text-muted">
              Your standard fee schedule. New scenarios start from these, and “Reset to my defaults” on Compare restores them.
            </div>
            <ClosingCostsEditor
              items={settings.feeDefaults ?? []}
              onChange={(items) => update({ feeDefaults: items })}
              showAmounts={false}
              onReset={() => update({ feeDefaults: cloneFees(defaultClosingCosts()) })}
              resetLabel="Reset to standard"
              emptyHint="No default fees yet."
              enableTitleSchedule
            />
            <Button variant="primary" size="md" className="mt-[14px]" disabled={saving} onClick={() => save()}>
              {saving ? 'Saving…' : 'Save Default Fees'}
            </Button>
          </div>

          {/* Desktop app (installable PWA) */}
          <div className="mb-4">
            <div className="mb-1 text-[14px] font-bold text-text-primary">Desktop App</div>
            <div className="mb-[14px] text-[12.5px] text-text-muted">
              Install LoanDr. as a desktop app — it opens in its own window with a taskbar/dock icon, no browser tabs.
            </div>
            {installed ? (
              <div className="rounded-[10px] border border-[rgba(52,211,153,0.28)] bg-[rgba(52,211,153,0.1)] px-3.5 py-2.5 text-[13px] font-semibold text-good">
                ✓ You’re using the installed desktop app.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Always shown + clickable. Uses the browser's native install prompt when
                    available, otherwise points to the manual steps just below. */}
                <Button
                  variant="primary"
                  size="md"
                  className="self-start"
                  onClick={async () => {
                    const outcome = await promptInstall();
                    if (outcome === 'accepted') setInstallMsg('');
                    else if (outcome === 'dismissed') setInstallMsg('Install canceled — you can do it any time from here.');
                    else setInstallMsg('Your browser didn’t show a one-click prompt — use the quick steps below to install.');
                  }}
                >
                  Download / Install Desktop App
                </Button>
                <div className="text-[11.5px] text-text-dim">
                  The website keeps working exactly as-is — installing the app is optional.
                </div>
                {installMsg && <div className="text-[12px] text-text-muted">{installMsg}</div>}
                <div className="rounded-[10px] border border-border-input bg-input px-3.5 py-2.5 text-[12px] leading-[1.6] text-text-soft">
                  <div className="mb-1 font-semibold text-text-primary">Install manually</div>
                  <div>
                    <strong>Chrome / Edge:</strong> click the install icon (a monitor with a ↓) at the right of the address bar, or the ⋮ menu → “Install LoanDr…”.
                  </div>
                  <div className="mt-1">
                    <strong>Safari (Mac):</strong> File → “Add to Dock”.
                  </div>
                  <div className="mt-1">
                    <strong>iPhone / iPad:</strong> Share → “Add to Home Screen”.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
