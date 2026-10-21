import { Link, useLocation } from 'react-router-dom';
import { useBilling } from '@/context/BillingContext';
import { bannerFor } from '@/lib/billing';

const TONES = {
  info: 'border-[rgba(47,128,237,0.28)] bg-[rgba(47,128,237,0.1)] text-text-primary',
  warn: 'border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.12)] text-text-primary',
  danger: 'border-danger bg-danger-tint text-danger',
} as const;

/** A slim notice above the page about the trial, a payment problem or a plan ending. */
export function BillingBanner() {
  const { status } = useBilling();
  const { pathname } = useLocation();
  const msg = bannerFor(status);
  // The billing page already says all of this in full.
  if (!msg || pathname.startsWith('/billing')) return null;
  return (
    <div
      role="status"
      className={`mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[11px] border px-4 py-2.5 text-[13.5px] ${TONES[msg.tone]}`}
    >
      <span>{msg.text}</span>
      <Link to="/billing" className="font-semibold text-brand-blue-light underline-offset-2 hover:underline">
        {msg.cta}
      </Link>
    </div>
  );
}
