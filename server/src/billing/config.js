// Billing settings. Everything is off until BILLING_ENABLED=true, so shipping this code
// never locks anyone out on its own.
//
// Prices live HERE (not in Stripe): Checkout is created with inline price data, so the
// amounts the app shows and the amounts Stripe charges can never drift apart. Override
// any of them with an env var; amounts are in cents.

const int = (name, fallback) => {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const DAY_MS = 24 * 60 * 60 * 1000;

export function billingEnabled() {
  return process.env.BILLING_ENABLED === 'true';
}

export function billingConfig() {
  return {
    // New accounts get this long before they have to pick a plan.
    trialDays: int('BILLING_TRIAL_DAYS', 14),
    // Accounts that already existed when billing was switched on get a longer runway.
    existingAccountTrialDays: int('BILLING_EXISTING_TRIAL_DAYS', 30),
    solo: {
      monthlyCents: int('BILLING_SOLO_MONTHLY_CENTS', 5900),
      // Per-month price when billed yearly; the card is charged 12x this once a year.
      annualMonthlyCents: int('BILLING_SOLO_ANNUAL_MONTHLY_CENTS', 4900),
    },
    team: {
      seatCents: int('BILLING_TEAM_SEAT_CENTS', 3900),
      // Teams are billed for at least this many seats.
      minSeats: Math.max(1, int('BILLING_TEAM_MIN_SEATS', 3)),
    },
  };
}

/** Emails that never need a plan (the owner's own login, plus any in BILLING_EXEMPT_EMAILS). */
export function exemptEmails() {
  const list = [process.env.OWNER_EMAIL, ...(process.env.BILLING_EXEMPT_EMAILS || '').split(',')]
    .map((e) => String(e || '').trim().toLowerCase())
    .filter(Boolean);
  return new Set(list);
}
