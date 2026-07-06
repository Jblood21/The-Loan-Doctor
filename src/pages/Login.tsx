import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { TextField, Label } from '@/components/ui/TextField';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';

const STATS = [
  { value: '6', label: 'scenarios at once' },
  { value: '5', label: 'loan programs' },
  { value: '1', label: 'click to export' },
];

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password, remember);
      } else {
        await register({ email, password, name, company, code });
      }
      navigate('/compare', { replace: true });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Something went wrong. Is the API running?';
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
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at 18% 22%, rgba(47,128,237,.22), transparent 42%),radial-gradient(circle at 82% 78%, rgba(45,212,191,.16), transparent 45%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px)',
            backgroundSize: '46px 46px',
            maskImage: 'linear-gradient(to bottom right, black, transparent 80%)',
            WebkitMaskImage: 'linear-gradient(to bottom right, black, transparent 80%)',
          }}
        />
        <div className="relative">
          <Logo size={42} wordmark={23} glow />
        </div>
        <div className="relative">
          <div className="max-w-[480px] font-display text-[46px] font-bold leading-[1.08] tracking-[-1.5px]">
            Every loan scenario, side by side in seconds.
          </div>
          <p className="mt-[22px] max-w-[430px] text-[16px] leading-[1.6] text-[#9db4cb]">
            The comparison workspace built for loan officers — model Conventional, FHA, VA, USDA, ARM and reverse
            mortgages, then hand your borrower a clean breakdown.
          </p>
          <div className="mt-[34px] flex gap-7">
            {STATS.map((s) => (
              <div key={s.label}>
                <div className="num text-[26px] font-semibold text-brand-teal">{s.value}</div>
                <div className="mt-0.5 text-[12.5px] text-[#7d96ae]">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-[12.5px] text-text-dim2">
          Equal Housing Lender · For licensed mortgage professionals
        </div>
      </div>

      {/* RIGHT — form */}
      <div className="flex flex-1 items-center justify-center bg-[#091522] p-10 lg:flex-[.95]">
        <form onSubmit={onSubmit} className="w-full max-w-[380px] animate-lp-fade-slow">
          <h1 className="m-0 font-display text-[28px] font-semibold tracking-[-0.6px]">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mb-[30px] mt-1.5 text-[14.5px] text-text-muted">
            {mode === 'login'
              ? 'Sign in to your loan officer workspace.'
              : 'Start comparing loans in under a minute.'}
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
              <Label>Access code</Label>
              <TextField
                size="lg"
                className="mb-[6px]"
                placeholder="Provided by your administrator"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
              />
              <p className="mb-[18px] text-[12px] leading-[1.5] text-text-dim2">
                Required only if this workspace is invite-only. Leave blank if you weren’t given one.
              </p>
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

          <Label>Password</Label>
          <TextField
            size="lg"
            type="password"
            name="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="mb-3.5"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {mode === 'login' && (
            <div className="mb-[26px] flex items-center justify-between text-[13px]">
              <label className="flex cursor-pointer items-center gap-2 text-[#9db4cb]">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-[15px] w-[15px] accent-brand-teal"
                />{' '}
                Remember me
              </label>
              <a className="cursor-pointer text-brand-blue-light no-underline">Forgot password?</a>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-[11px] border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.1)] px-[15px] py-3 text-[13px] text-danger">
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
                : 'Creating…'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </Button>

          <div className="mt-[22px] text-center text-[13.5px] text-text-muted">
            {mode === 'login' ? (
              <>
                New here?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError('');
                  }}
                  className="cursor-pointer border-none bg-transparent font-semibold text-brand-blue-light"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                  className="cursor-pointer border-none bg-transparent font-semibold text-brand-blue-light"
                >
                  Sign in
                </button>
              </>
            )}
          </div>

          <div className="mt-7 rounded-[11px] border border-[rgba(47,128,237,0.2)] bg-[rgba(47,128,237,0.08)] px-[15px] py-[13px] text-[12.5px] leading-[1.5] text-[#8fb4dd]">
            <strong>Preview build</strong> — for evaluation and demonstration. Please don’t enter real borrower
            personal or financial information.
          </div>
        </form>
      </div>
    </div>
  );
}
