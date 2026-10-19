import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { TextField, Label } from '@/components/ui/TextField';
import { api, ApiError } from '@/lib/api';
import { agentApi } from '@/lib/agentApi';

/** Public page reached from the emailed reset link: /reset-password?token=…&kind=user|agent */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const isAgent = params.get('kind') === 'agent';
  const signInHref = isAgent ? '/agent' : '/login';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError('Passwords don’t match.');
    setSubmitting(true);
    try {
      await (isAgent ? agentApi : api).resetPassword({ token, newPassword: password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset your password. Please request a new link.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-app p-6">
      <div className="w-full max-w-[400px] animate-lp-fade">
        <div className="mb-7 flex justify-center">
          <Logo size={40} glow />
        </div>

        {!token ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <h1 className="m-0 text-[20px] font-semibold text-text-heading">Invalid reset link</h1>
            <p className="mt-2 text-[14px] text-text-muted">This link is missing its token. Request a new one from the sign-in page.</p>
            <Link to={signInHref} className="mt-4 inline-block font-semibold text-brand">
              Back to sign in →
            </Link>
          </div>
        ) : done ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <h1 className="m-0 text-[20px] font-semibold text-text-heading">Password updated</h1>
            <p className="mt-2 text-[14px] text-text-muted">Your password has been changed. You can now sign in with it.</p>
            <Link to={signInHref} className="mt-4 inline-block">
              <Button variant="primary" className="!h-[46px] w-full">Go to sign in</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="rounded-xl border border-border bg-surface p-6">
            <h1 className="m-0 text-[22px] font-semibold text-text-heading">Choose a new password</h1>
            <p className="mb-5 mt-1.5 text-[14px] text-text-muted">Enter a new password for your {isAgent ? 'agent' : ''} account.</p>

            <Label>New password</Label>
            <div className="relative mb-[18px]">
              <TextField
                size="lg"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                className="!pr-[68px]"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer border-none bg-transparent px-1 text-[12.5px] font-semibold text-brand"
              >
                {show ? 'Hide' : 'Show'}
              </button>
            </div>

            <Label>Confirm new password</Label>
            <TextField
              size="lg"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              className="mb-[18px]"
              placeholder="Re-enter password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />

            {error && (
              <div className="mb-4 rounded-[11px] border border-danger bg-danger-tint px-[15px] py-3 text-[13px] text-danger">
                {error}
              </div>
            )}

            <Button type="submit" variant="primary" disabled={submitting} className="!h-[48px] w-full !text-[15px]">
              {submitting ? 'Updating…' : 'Update password'}
            </Button>
            <div className="mt-4 text-center text-[13.5px] text-text-muted">
              <Link to={signInHref} className="font-semibold text-brand">Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
