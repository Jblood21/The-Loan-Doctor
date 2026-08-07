import { useUI } from '@/context/UIContext';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from './ui/Button';
import { TextField, Label } from './ui/TextField';
import { ClosingCostsEditor, cloneFees } from './ClosingCostsEditor';
import { defaultClosingCosts } from '@/lib/finance';
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
      { key: 'company', label: 'Company', ph: 'CFG Home Loans' },
      { key: 'email', label: 'Email', ph: 'you@lender.com' },
      { key: 'phone', label: 'Phone', ph: '801.706.2802' },
      { key: 'nmls', label: 'NMLS #', ph: '3146' },
    ],
  },
  {
    title: 'Lender Information',
    note: "Your institution's details for branding.",
    cta: 'Save Lender Info',
    fields: [
      { key: 'lenderName', label: 'Lender Name', ph: 'First National Bank' },
      { key: 'lenderNmls', label: 'Lender NMLS #', ph: '123456' },
      { key: 'website', label: 'Website', ph: 'www.example.com' },
      { key: 'lenderAddress', label: 'Address', ph: '123 Main St, Suite 100 · City, ST' },
      { key: 'lenderPhone', label: 'Lender Phone', ph: '(800) 555-1234' },
    ],
  },
  {
    title: 'Dual Branding',
    note: 'Add a real-estate agent to generated documents.',
    cta: 'Save Agent Info',
    fields: [
      { key: 'agentName', label: 'Agent Name', ph: 'Jane Doe' },
      { key: 'brokerage', label: 'Brokerage', ph: 'ABC Realty' },
      { key: 'agentPhone', label: 'Phone', ph: '(555) 987-6543' },
    ],
  },
  {
    title: 'Title & Settlement',
    note: 'Used to estimate title fees in cash-to-close.',
    cta: 'Save Title Info',
    fields: [
      { key: 'titleCompany', label: 'Title Company', ph: 'Secure Title LLC' },
      { key: 'titleAgentName', label: 'Settlement Agent', ph: 'Pat Closing' },
      { key: 'titleFeesPct', label: 'Title Fees (% of loan)', ph: '0.5', type: 'number' },
    ],
  },
];

export function SettingsDrawer() {
  const { settingsOpen, closeSettings } = useUI();
  const { settings, update, save, saving } = useSettings();
  const { user } = useAuth();

  if (!settingsOpen) return null;

  const name = settings.name || user?.name || 'Loan Officer';

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
        </div>
      </div>
    </>
  );
}
