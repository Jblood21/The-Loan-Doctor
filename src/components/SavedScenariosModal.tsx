import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useScenarios } from '@/context/ScenariosContext';
import { computeScenario } from '@/lib/finance';
import { fmt, fmt2 } from '@/lib/format';
import type { Scenario } from '@/types';

/** One-line summary of a scenario for the list rows. */
function summarize(s: Scenario): string {
  const c = computeScenario(s);
  const price = fmt(s.homePrice || 0);
  const dn = Math.round(s.homePrice > 0 ? ((s.downPayment || 0) / s.homePrice) * 100 : s.downPct || 0);
  const txn = s.transaction === 'refinance' ? 'Refi' : 'Purchase';
  return `${c.typeLabel} · ${txn} · ${price} · ${s.rate || 0}% · ${dn}% down · ${fmt2(c.totalMonthly)}/mo`;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Browse the one saved bank of scenarios — shared by Compare and Pre-Approval.
 * Open pulls a scenario into the comparison; Delete removes it from the bank.
 * Saving happens with the Compare screen's "Save" button (one place to save).
 */
export function SavedScenariosModal({ open, onClose }: Props) {
  const { bank, scenarios, addScenarioFrom, deleteFromBank } = useScenarios();
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');

  const openIds = useMemo(() => new Set(scenarios.map((s) => s.id).filter(Boolean)), [scenarios]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bank;
    return bank.filter((s) => `${s.name} ${summarize(s)}`.toLowerCase().includes(q));
  }, [bank, query]);

  const openScenario = (s: Scenario) => {
    const ok = addScenarioFrom(s);
    if (ok) onClose();
    else setNote('Your comparison already has 6 scenarios — remove one, then open this.');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Saved Scenarios"
      subtitle="Every scenario you’ve saved — open one into the comparison or use it on the Pre-Approval tab."
      width={680}
    >
      {note && (
        <div className="mb-3 rounded-[10px] border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.08)] px-3.5 py-2 text-[12.5px] text-danger">
          {note}
        </div>
      )}

      {bank.length > 0 && (
        <TextField
          className="mb-3"
          placeholder="Search saved scenarios…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search saved scenarios"
        />
      )}

      {bank.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-text-muted">
          No saved scenarios yet. Build one on the Compare screen and hit <span className="font-semibold">Save</span> — it’ll show up
          here and in the Pre-Approval scenario picker.
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-text-muted">No saved scenarios match “{query}”.</div>
      ) : (
        <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-0.5">
          {filtered.map((s) => {
            const isOpen = !!s.id && openIds.has(s.id);
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 hover:border-brand-teal"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-text-primary">
                    {s.name}
                    {isOpen && <span className="ml-2 text-[11px] font-normal text-brand-teal">· in comparison</span>}
                  </div>
                  <div className="truncate text-[12px] text-text-muted">{summarize(s)}</div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openScenario(s)}>
                    {isOpen ? 'Focus' : 'Open'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => s.id && deleteFromBank(s.id)}
                    title="Delete saved scenario"
                    aria-label={`Delete ${s.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-border-input bg-input text-[16px] leading-none text-text-dim transition-colors hover:border-danger hover:text-danger"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
