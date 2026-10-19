import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { TextField, Label } from '@/components/ui/TextField';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/lib/api';

const STATS = [
  { value: '6', label: 'scenarios at once' },
  { value: '5', label: 'loan programs' },
  { value: '1', label: 'click to export' },
];

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [devLink, setDevLink] = useState('');

  // Switch between sign-in / register / forgot-password, clearing transient messages.
  const switchMode = (next: 'login' | 'register' | 'forgot') => {
    setMode(next);
    setError('');
    setInfo('');
    setResetSent(false);
    setDevLink('');
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setSubmitting(true);
    const cleanEmail = email.trim();
    try {
      if (mode === 'forgot') {
        const res = await api.forgotPassword({ email: cleanEmail });
        setResetSent(true);
        setDevLink(res.devLink || '');
        return;
      }
      if (mode === 'login') {
        await login(cleanEmail, password, remember);
      } else {
        await register({ email: cleanEmail, password, name: name.trim(), company: company.trim() });
      }
      navigate('/compare', { replace: true });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Can’t reach the server right now. It may be waking up — wait a moment and try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen animate-lp-fade">
      {/* LEFT — brand panel */}
      <div
        className="relative hidden flex-[1.05] flex-col justify-between overflow-hidden bg-login-panel p-[56px] pb-12 lg:flex"
      >
        {/* Scenic brand backdrop — day landscape (light) / night scene (dark). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'var(--app-scene)' }}
        />
        {/* Left-weighted scrim so the left-aligned copy stays readable. */}
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'var(--login-scrim)' }} />
        <div className="relative z-10">
          <Logo size={50} glow />
        </div>
        <div className="relative z-10">
          <div className="max-w-[480px] font-display text-[46px] font-bold leading-[1.08] tracking-[-1.5px]">
            Every loan scenario, side by side in seconds.
          </div>
          <p className="mt-[22px] max-w-[430px] text-[16px] leading-[1.6] text-ink-muted">
            The comparison workspace built for loan officers — model Conventional, FHA, VA, USDA, ARM and reverse
            mortgages, then hand your borrower a clean breakdown.
          </p>
          <div className="mt-[34px] flex gap-7">
            {STATS.map((s) => (
              <div key={s.label}>
                <div className="num text-[26px] font-semibold text-brand-teal">{s.value}</div>
                <div className="mt-0.5 text-[12.5px] text-ink-muted">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 text-[12.5px] font-medium text-ink-muted">
          Equal Housing Lender · For licensed mortgage professionals
        </div>
      </div>

      {/* RIGHT — form */}
      <div className="flex flex-1 items-center justify-center bg-surface p-6 sm:p-10 lg:flex-[.95]">
        <form onSubmit={onSubmit} className="w-full max-w-[380px] animate-lp-fade-slow">
          <h1 className="m-0 font-display text-[28px] font-semibold tracking-[-0.6px]">
            {mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your account' : 'Reset your password'}
          </h1>
          <p className="mb-[30px] mt-1.5 text-[14.5px] text-text-muted">
            {mode === 'login'
              ? 'Sign in to your loan officer workspace.'
              : mode === 'register'
                ? 'Start comparing loans in under a minute.'
                : 'Enter your email and we’ll send you a link to set a new password.'}
          </p>

          {mode === 'register' && (
            <>
              <Label>Your Name</Label>
              <TextField
                size="lg"
                className="mb-[18px]"
                placeholder="John Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Label>Company</Label>
              <TextField
                size="lg"
                className="mb-[18px]"
                placeholder="ABC Mortgage"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </>
          )}

          <Label>Email</Label>
          <TextField
            size="lg"
            type="email"
            name="email"
            autoComplete="username"
            className="mb-[18px]"
            placeholder="you@lender.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          {mode !== 'forgot' && (
            <>
              <Label>Password</Label>
              <div className="relative mb-3.5">
                <TextField
                  size="lg"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="!pr-[68px]"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer border-none bg-transparent px-1 text-[12.5px] font-semibold text-brand-blue-light"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </>
          )}

          {mode === 'login' && (
            <div className="mb-[26px] flex items-center justify-between text-[13px]">
              <label className="flex cursor-pointer items-center gap-2 text-ink-muted">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-[15px] w-[15px] accent-brand-teal"
                />{' '}
                Remember me
              </label>
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="cursor-pointer border-none bg-transparent text-brand-blue-light no-underline"
              >
                Forgot password?
              </button>
            </div>
          )}

          {mode === 'forgot' && resetSent && (
            <div className="mb-4 rounded-[11px] border border-border bg-surface-tint px-[15px] py-3 text-[13px] leading-[1.55] text-ink">
              If an account exists for that email, we’ve sent a link to reset your password. Check your inbox
              (and spam folder).
              {devLink && (
                <div className="mt-2">
                  <span className="text-text-muted">Dev link:</span>{' '}
                  <a href={devLink} className="break-all font-semibold text-brand-blue-light underline">
                    {devLink}
                  </a>
                </div>
              )}
            </div>
          )}

          {info && (
            <div className="mb-4 rounded-[11px] border border-border bg-surface-tint px-[15px] py-3 text-[13px] text-ink">
              {info}
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-[11px] border border-danger bg-danger-tint px-[15px] py-3 text-[13px] text-danger">
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={submitting}
            className="!h-[50px] w-full !rounded-xl !text-[15.5px] tracking-[0.2px]"
          >
            {submitting
              ? mode === 'login'
                ? 'Signing in…'
                : mode === 'register'
                  ? 'Creating…'
                  : 'Sending…'
              : mode === 'login'
                ? 'Sign in'
                : mode === 'register'
                  ? 'Create account'
                  : 'Send reset link'}
          </Button>

          <div className="mt-[22px] text-center text-[13.5px] text-text-muted">
            {mode === 'login' ? (
              <>
                New here?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="cursor-pointer border-none bg-transparent font-semibold text-brand-blue-light"
                >
                  Create an account
                </button>
              </>
            ) : mode === 'register' ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="cursor-pointer border-none bg-transparent font-semibold text-brand-blue-light"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                Remembered it?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="cursor-pointer border-none bg-transparent font-semibold text-brand-blue-light"
                >
                  Back to sign in
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
