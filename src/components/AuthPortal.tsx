import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import { ApiError, authApi, setStoredToken } from '../utils/api';
import type { AccountStatus, UserProfile } from '../utils/domain';
import type { AuthModeType, AuthPortalType } from '../utils/routing';
import { PWAInstallButton } from './PWAInstallButton';

interface Props {
  onAuthenticated: (user: UserProfile) => void;
  initialPortal?: AuthPortalType;
  initialMode?: AuthModeType;
  guardNotice?: string | null;
  externalBlockedStatus?: AccountStatus | null;
  onRouteSync?: (portal: AuthPortalType, mode: AuthModeType) => void;
}

export const AuthPortal: React.FC<Props> = ({
  onAuthenticated,
  initialPortal = 'staff',
  initialMode = 'login',
  guardNotice = null,
  externalBlockedStatus = null,
  onRouteSync,
}) => {
  const [portal, setPortal] = useState<AuthPortalType>(initialPortal);
  const [mode, setMode] = useState<AuthModeType>(initialMode);
  const [hasAdmin, setHasAdmin] = useState<boolean>(true);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(guardNotice);
  const [notice, setNotice] = useState<string | null>(null);
  const [blockedStatus, setBlockedStatus] = useState<AccountStatus | null>(externalBlockedStatus);

  useEffect(() => {
    setPortal(initialPortal);
  }, [initialPortal]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (guardNotice) {
      setError(guardNotice);
    }
  }, [guardNotice]);

  useEffect(() => {
    if (externalBlockedStatus) {
      setBlockedStatus(externalBlockedStatus);
    }
  }, [externalBlockedStatus]);

  useEffect(() => {
    authApi
      .bootstrapStatus()
      .then((res) => setHasAdmin(res.hasAdmin))
      .catch(() => setHasAdmin(true));
  }, []);

  const switchPortal = (next: AuthPortalType) => {
    setPortal(next);
    setMode('login');
    setError(null);
    setNotice(null);
    setBlockedStatus(null);
    onRouteSync?.(next, 'login');
  };

  const changeMode = (nextMode: AuthModeType) => {
    setMode(nextMode);
    setError(null);
    setNotice(null);
    setBlockedStatus(null);
    onRouteSync?.(portal, nextMode);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBlockedStatus(null);
    setLoading(true);
    try {
      const res = await authApi.login({ email, password, portal });
      setStoredToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.accountStatus) setBlockedStatus(err.accountStatus);
      } else {
        setError('Unable to sign in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBlockedStatus(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter your password.');
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.registerStaff({ fullName, email, password });
      setNotice(res.message);
      setBlockedStatus('pending');
      setMode('login');
      onRouteSync?.('staff', 'login');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await authApi.requestPasswordReset(email);
      setNotice(res.message);
      setMode('reset-confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to request password reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.resetPassword({ email, resetCode, newPassword });
      setNotice(res.message);
      setMode('login');
      onRouteSync?.(portal, 'login');
      setResetCode('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D0D0F] text-[#FAF7F0] lg:grid lg:grid-cols-12">
      {/* Left Brand Showcase */}
      <section className="flex flex-col justify-between border-b border-[#242429] bg-[#0D0D0F] px-6 py-8 lg:col-span-5 lg:border-b-0 lg:border-r lg:px-12 lg:py-12">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-medium tracking-[0.22em] text-[#C5A059] uppercase">
            Order &amp; Stock Atelier
          </span>
          <PWAInstallButton variant="dark" />
        </div>

        <div className="my-8 flex flex-col items-center text-center lg:my-0">
          <div className="w-44 sm:w-52 overflow-hidden rounded-2xl border border-[#C5A059]/25 bg-[#0D0D0F] p-2 shadow-2xl">
            <img
              src="/assets/aistudio/LOGO_5a702867.png"
              alt="AVENOR LEGACY official monogram and brand emblem"
              referrerPolicy="no-referrer"
              className="h-auto w-full rounded-xl object-contain"
            />
          </div>
          <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight text-[#FAF7F0] sm:text-5xl text-balance">
            AVENOR LEGACY
          </h1>
          <p className="mt-2 text-xs font-semibold tracking-[0.34em] text-[#C5A059] uppercase">
            WEAR THE LEGACY
          </p>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-[#A8A298]">
            Precision inventory control, verified BDT pricing, and atomic order fulfillment for luxury menswear operations.
          </p>
        </div>

        <div className="border-t border-[#222227] pt-5 text-xs text-[#7E786E] flex flex-wrap items-center justify-between gap-2">
          <span>Role-Verified Operations</span>
          <span>Atomic Stock Ledger · BDT</span>
        </div>
      </section>

      {/* Right Authentication Workspace */}
      <main className="flex items-center justify-center bg-[#FAF7F0] px-5 py-10 text-[#141416] sm:px-10 lg:col-span-7">
        <div className="w-full max-w-md">
          {/* Portal Switcher */}
          <div className="mb-8">
            <p className="text-xs font-medium tracking-wider text-[#6B655B] uppercase">
              Select Entry Portal
            </p>
            <div
              role="tablist"
              aria-label="Portal entry selection"
              className="mt-2.5 grid grid-cols-2 gap-1.5 rounded-xl border border-[#E5DFD3] bg-[#F1ECE1] p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={portal === 'staff'}
                onClick={() => switchPortal('staff')}
                className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  portal === 'staff'
                    ? 'bg-[#0D0D0F] text-[#FAF7F0] shadow-xs'
                    : 'text-[#544F47] hover:text-[#0D0D0F]'
                }`}
              >
                <UserCheck className="h-4 w-4 text-[#C5A059]" />
                <span>Staff Portal</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={portal === 'admin'}
                onClick={() => switchPortal('admin')}
                className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  portal === 'admin'
                    ? 'bg-[#0D0D0F] text-[#FAF7F0] shadow-xs'
                    : 'text-[#544F47] hover:text-[#0D0D0F]'
                }`}
              >
                <ShieldCheck className="h-4 w-4 text-[#C5A059]" />
                <span>Admin Portal</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E5DFD3] bg-white p-6 sm:p-8 shadow-sm">
            <div className="mb-6">
              <h2 className="font-display text-3xl font-semibold text-[#0D0D0F]">
                {mode === 'login' && (portal === 'admin' ? 'Admin Sign In' : 'Staff Sign In')}
                {mode === 'register' && 'Staff Registration'}
                {mode === 'reset-request' && 'Reset Password'}
                {mode === 'reset-confirm' && 'Verify Reset Code'}
              </h2>
              <p className="mt-1 text-sm text-[#6B655B]">
                {mode === 'login' &&
                  (portal === 'admin'
                    ? 'Authorized Main Admin access for catalog, stock, and approvals.'
                    : 'Access your approved advisor workspace and order pipeline.')}
                {mode === 'register' &&
                  'New staff registrations require Main Admin approval before access is granted.'}
                {mode === 'reset-request' &&
                  'Request a single-use password reset code for your approved account.'}
                {mode === 'reset-confirm' &&
                  'Enter the 8-character reset code and choose a new password.'}
              </p>
            </div>

            {portal === 'admin' && !hasAdmin && (
              <div className="mb-5 rounded-lg border border-[#C5A059]/40 bg-[#FAF7F0] p-3.5 text-xs text-[#4A463F]">
                <p className="font-semibold text-[#0D0D0F]">First Main Admin Setup Required</p>
                <p className="mt-1 leading-relaxed">
                  No Main Admin account exists yet. For security, public admin sign-up is disabled. Provision the first Main Admin from the server CLI:
                </p>
                <code className="mt-2 block rounded bg-[#0D0D0F] px-2.5 py-1.5 font-mono text-[11px] text-[#C5A059] break-all">
                  npm run setup:admin -- --name &quot;Owner&quot; --email &quot;admin@avenorlegacy.com&quot; --password &quot;YourStrongPass&quot;
                </code>
              </div>
            )}

            {blockedStatus && (
              <div
                role="status"
                className="mb-5 rounded-lg border border-[#B45309]/30 bg-[#FFFBEB] p-3.5 text-xs text-[#78350F]"
              >
                <p className="font-semibold capitalize">Account Status: {blockedStatus}</p>
                <p className="mt-1">
                  {blockedStatus === 'pending' &&
                    'Your registration has been recorded and the Main Admin has been notified. You will be able to sign in once approved.'}
                  {blockedStatus === 'rejected' &&
                    'This account request was declined by the administrator.'}
                  {blockedStatus === 'suspended' &&
                    'This account is currently suspended. Contact the Main Admin to restore access.'}
                </p>
              </div>
            )}

            {error && !blockedStatus && (
              <div
                role="alert"
                className="mb-5 rounded-lg border border-[#B91C1C]/30 bg-[#FEF2F2] p-3 text-xs font-medium text-[#991B1B]"
              >
                {error}
              </div>
            )}

            {notice && !blockedStatus && (
              <div
                role="status"
                className="mb-5 rounded-lg border border-[#15803D]/30 bg-[#F0FDF4] p-3 text-xs font-medium text-[#166534]"
              >
                {notice}
              </div>
            )}

            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="auth-email" className="block text-xs font-medium text-[#3A3731]">
                    Email Address
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={portal === 'admin' ? 'admin@avenorlegacy.com' : 'advisor@avenorlegacy.com'}
                    className="mt-1.5 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3.5 py-2.5 text-sm text-[#141416] placeholder:text-[#9A9388] focus:border-[#B89242] focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="auth-password" className="block text-xs font-medium text-[#3A3731]">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => changeMode('reset-request')}
                      className="text-xs font-medium text-[#8A6820] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative mt-1.5">
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3.5 py-2.5 pr-10 text-sm text-[#141416] placeholder:text-[#9A9388] focus:border-[#B89242] focus:bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label="Toggle visibility"
                      className="absolute inset-y-0 right-2 flex items-center px-1.5 text-[#6B655B] hover:text-[#0D0D0F]"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#0D0D0F] px-4 py-3 text-sm font-medium text-[#FAF7F0] hover:bg-[#1E1E24] disabled:opacity-50 transition-colors"
                >
                  <Lock className="h-4 w-4 text-[#C5A059]" />
                  <span>{loading ? 'Verifying...' : `Sign In to ${portal === 'admin' ? 'Admin' : 'Staff'} Portal`}</span>
                </button>
              </form>
            )}

            {mode === 'register' && portal === 'staff' && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label htmlFor="reg-name" className="block text-xs font-medium text-[#3A3731]">
                    Full Name
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    required
                    minLength={2}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Rafiqul Islam"
                    className="mt-1.5 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3.5 py-2.5 text-sm text-[#141416] focus:border-[#B89242] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="reg-email" className="block text-xs font-medium text-[#3A3731]">
                    Work Email
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="advisor@avenorlegacy.com"
                    className="mt-1.5 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3.5 py-2.5 text-sm text-[#141416] focus:border-[#B89242] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="reg-password" className="block text-xs font-medium text-[#3A3731]">
                    Password (minimum 8 characters)
                  </label>
                  <input
                    id="reg-password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password"
                    className="mt-1.5 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3.5 py-2.5 text-sm text-[#141416] focus:border-[#B89242] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="reg-confirm-password" className="block text-xs font-medium text-[#3A3731]">
                    Confirm Password
                  </label>
                  <input
                    id="reg-confirm-password"
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="mt-1.5 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3.5 py-2.5 text-sm text-[#141416] focus:border-[#B89242] focus:bg-white focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-[#0D0D0F] px-4 py-3 text-sm font-medium text-[#FAF7F0] hover:bg-[#1E1E24] disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Submitting Request...' : 'Submit Staff Registration'}
                </button>
              </form>
            )}

            {mode === 'reset-request' && (
              <form onSubmit={handleResetRequest} className="space-y-4">
                <div>
                  <label htmlFor="reset-email" className="block text-xs font-medium text-[#3A3731]">
                    Account Email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your registered email"
                    className="mt-1.5 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3.5 py-2.5 text-sm text-[#141416] focus:border-[#B89242] focus:bg-white focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0D0D0F] px-4 py-3 text-sm font-medium text-[#FAF7F0] hover:bg-[#1E1E24] disabled:opacity-50 transition-colors"
                >
                  <KeyRound className="h-4 w-4 text-[#C5A059]" />
                  <span>{loading ? 'Requesting...' : 'Request Reset Code'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('reset-confirm')}
                  className="w-full text-center text-xs font-medium text-[#8A6820] hover:underline"
                >
                  Already have a reset code? Enter it here
                </button>
              </form>
            )}

            {mode === 'reset-confirm' && (
              <form onSubmit={handleResetConfirm} className="space-y-4">
                <div>
                  <label htmlFor="rc-email" className="block text-xs font-medium text-[#3A3731]">
                    Email Address
                  </label>
                  <input
                    id="rc-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3.5 py-2.5 text-sm text-[#141416] focus:border-[#B89242] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="rc-code" className="block text-xs font-medium text-[#3A3731]">
                    Reset Code
                  </label>
                  <input
                    id="rc-code"
                    type="text"
                    required
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.toUpperCase())}
                    placeholder="8-character reset code"
                    className="mt-1.5 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3.5 py-2.5 font-mono text-sm uppercase text-[#141416] focus:border-[#B89242] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="rc-pass" className="block text-xs font-medium text-[#3A3731]">
                    New Password (minimum 8 characters)
                  </label>
                  <input
                    id="rc-pass"
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3.5 py-2.5 text-sm text-[#141416] focus:border-[#B89242] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="rc-confirm-pass" className="block text-xs font-medium text-[#3A3731]">
                    Confirm New Password
                  </label>
                  <input
                    id="rc-confirm-pass"
                    type="password"
                    required
                    minLength={8}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3.5 py-2.5 text-sm text-[#141416] focus:border-[#B89242] focus:bg-white focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-[#0D0D0F] px-4 py-3 text-sm font-medium text-[#FAF7F0] hover:bg-[#1E1E24] disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Updating Password...' : 'Confirm Password Reset'}
                </button>
              </form>
            )}

            <div className="mt-6 border-t border-[#ECE6DA] pt-4 text-center text-xs text-[#6B655B]">
              {portal === 'staff' && mode === 'login' && (
                <span>
                  New advisor?{' '}
                  <button
                    type="button"
                    onClick={() => changeMode('register')}
                    className="font-semibold text-[#8A6820] hover:underline"
                  >
                    Register for Staff Access
                  </button>
                </span>
              )}
              {portal === 'admin' && mode === 'login' && (
                <span>Admin registration is restricted to server-side owner provisioning.</span>
              )}
              {mode !== 'login' && (
                <button
                  type="button"
                  onClick={() => changeMode('login')}
                  className="font-semibold text-[#0D0D0F] hover:underline"
                >
                  Back to Sign In
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
