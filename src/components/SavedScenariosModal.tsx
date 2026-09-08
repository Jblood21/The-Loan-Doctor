import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useScenarios } from '@/context/ScenariosContext';
import { api } from '@/lib/api';
import { computeScenario } from '@/lib/finance';
import { fmt, fmt2 } from '@/lib/format';
import type { SavedScenario } from '@/types';

/** One-line summary of a saved scenario for the list rows. */
function summarize(s: SavedScenario['scenario']): string {
  const c = computeScenario(s);
  const price = fmt(s.homePrice || 0);
  const dn = Math.round(s.homePrice > 0 ? ((s.downPayment || 0) / s.homePrice) * 100 : s.downPct || 0);
  const txn = s.transaction === 'refinance' ? 'Refi' : 'Purchase';
  return `${c.typeLabel} · ${txn} · ${price} · ${s.rate || 0}% · ${dn}% down · ${fmt2(c.totalMonthly)}/mo`;
}

function whenSaved(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Browse, reopen, save, and delete scenarios kept in the user's library. */
export function SavedScenariosModal({ open, onClose }: Props) {
  const { current, addScenarioFrom } = useScenarios();
  const [items, setItems] = useState<SavedScenario[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  // Load the library whenever the popup is opened.
  useEffect(() => {
    if (!open) return;
    setNote(null);
    setLoading(true);
    setError('');
    let cancelled = false;
    api
      .listSavedScenarios()
      .then(({ saved }) => {
        if (!cancelled) setItems(Array.isArray(saved) ? saved : []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your saved scenarios. The server may be waking up — try again in a moment.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => `${it.name} ${summarize(it.scenario)}`.toLowerCase().includes(q));
  }, [items, query]);

  const saveCurrent = async () => {
    setBusy(true);
    setNote(null);
    try {
      const { saved } = await api.saveScenarioToLibrary(current.name || 'Saved scenario', current);
      setItems((list) => [saved, ...list]);
      setNote({ tone: 'ok', text: `Saved “${saved.name}” to your library.` });
    } catch {
      setNote({ tone: 'err', text: 'Could not save that scenario. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const load = (it: SavedScenario) => {
    const ok = addScenarioFrom(it.scenario);
    if (ok) {
      onClose();
    } else {
      setNote({ tone: 'err', text: 'Your comparison already has 6 scenarios — remove one, then load this.' });
    }
  };

  const remove = async (it: SavedScenario) => {
    setItems((list) => list.filter((x) => x.id !== it.id));
    try {
      await api.deleteSavedScenario(it.id);
    } catch {
      // Put it back if the delete failed on the server.
      setItems((list) => [it, ...list.filter((x) => x.id !== it.id)]);
      setNote({ tone: 'err', text: 'Could not delete that scenario. Please try again.' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Saved Scenarios"
      subtitle="Save the scenario you’re viewing, and reopen any you’ve kept."
      width={680}
    >
      {/* Save the current scenario */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-elevated px-4 py-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-text-primary">Current: {current.name || 'Untitled'}</div>
          <div className="truncate text-[12px] text-text-muted">{summarize(current)}</div>
        </div>
        <Button variant="primary" onClick={saveCurrent} disabled={busy}>
          {busy ? 'Saving…' : '+ Save this scenario'}
        </Button>
      </div>

      {note && (
        <div
          className={`mb-3 rounded-[10px] border px-3.5 py-2 text-[12.5px] ${
            note.tone === 'ok'
              ? 'border-[rgba(52,211,153,0.3)] bg-[rgba(52,211,153,0.08)] text-good'
              : 'border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.08)] text-danger'
          }`}
        >
          {note.text}
        </div>
      )}

      {items.length > 0 && (
        <TextField
          className="mb-3"
          placeholder="Search saved scenarios by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search saved scenarios"
        />
      )}

      {/* Library list */}
      {loading ? (
        <div className="py-8 text-center text-[13px] text-text-muted">Loading your saved scenarios…</div>
      ) : error ? (
        <div className="py-6 text-center text-[13px] text-danger">{error}</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-text-muted">
          No saved scenarios yet. Use “Save this scenario” above to keep the one you’re working on so you can find it later.
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-text-muted">No saved scenarios match “{query}”.</div>
      ) : (
        <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-0.5">
          {filtered.map((it) => (
            <div
              key={it.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 hover:border-brand-teal"
            >
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold text-text-primary">{it.name}</div>
                <div className="truncate text-[12px] text-text-muted">{summarize(it.scenario)}</div>
                {whenSaved(it.savedAt) && <div className="mt-0.5 text-[11px] text-text-dim">Saved {whenSaved(it.savedAt)}</div>}
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => load(it)}>
                  Open
                </Button>
                <button
                  type="button"
                  onClick={() => remove(it)}
                  title="Delete saved scenario"
                  aria-label={`Delete ${it.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-border-input bg-input text-[16px] leading-none text-text-dim transition-colors hover:border-danger hover:text-danger"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
