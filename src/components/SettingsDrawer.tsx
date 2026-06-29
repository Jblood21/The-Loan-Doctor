import { useUI } from '@/context/UIContext';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from './ui/Button';
import { TextField, Label } from './ui/TextField';
import { initials } from '@/lib/format';
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

          <div className="mb-2 flex items-center justify-between rounded-xl border border-border bg-elevated px-4 py-[14px]">
            <div>
              <div className="text-[14px] font-bold text-text-primary">Dark mode</div>
              <div className="text-[12.5px] text-text-muted">LoanDr. ships dark by default.</div>
            </div>
            <button
              role="switch"
              aria-checked={settings.darkMode}
              onClick={() => save({ darkMode: !settings.darkMode })}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                settings.darkMode ? 'bg-brand-blue' : 'bg-border-input'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                  settings.darkMode ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
