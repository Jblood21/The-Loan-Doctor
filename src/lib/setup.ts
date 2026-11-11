import type { Settings } from '@/types';

export interface SetupItem {
  key: 'name' | 'nmls' | 'company' | 'contact' | 'logo';
  label: string;
  /** How the item reads inside a sentence ("add your ___"). */
  phrase: string;
  required: boolean;
  done: boolean;
}

const has = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

/** How much of the letterhead is filled in. A letter or PDF needs the three required items
 *  (they are printed on it); phone/email and a logo make it look finished. */
export function setupStatus(s: Partial<Settings>) {
  const items: SetupItem[] = [
    { key: 'name', label: 'Your name', phrase: 'name', required: true, done: has(s.name) },
    { key: 'nmls', label: 'Your NMLS number', phrase: 'NMLS number', required: true, done: has(s.nmls) },
    { key: 'company', label: 'Company name', phrase: 'company name', required: true, done: has(s.lenderName) || has(s.company) },
    { key: 'contact', label: 'Phone and email', phrase: 'phone and email', required: false, done: has(s.phone) && has(s.email) },
    { key: 'logo', label: 'Logo', phrase: 'logo', required: false, done: has(s.logoDataUrl) },
  ];
  const required = items.filter((i) => i.required);
  const requiredDone = required.filter((i) => i.done).length;
  return {
    items,
    requiredDone,
    requiredTotal: required.length,
    complete: requiredDone === required.length,
    missing: required.filter((i) => !i.done).map((i) => i.label),
    /** "name, NMLS number and company name": what is still needed, ready for a sentence. */
    missingPhrase: joinList(required.filter((i) => !i.done).map((i) => i.phrase)),
  };
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
