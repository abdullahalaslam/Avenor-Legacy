import React, { useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { authApi } from '../../utils/api';
import type { UserProfile } from '../../utils/domain';
import { PWAInstallButton } from '../PWAInstallButton';

interface Props {
  user: UserProfile;
}

export const AdminSettingsView: React.FC<Props> = ({ user }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await authApi.changePassword({ currentPassword, newPassword });
      setMessage({ type: 'ok', text: res.message });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to update password.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="font-display text-3xl font-semibold text-[#0D0D0F]">Settings &amp; Security</h2>
        <p className="mt-1 text-sm text-[#6B655B]">
          Administrator account security, PWA installation, and server-side RBAC overview.
        </p>
      </div>

      <section className="rounded-xl border border-[#E5DFD3] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0D0D0F] text-[#C5A059]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#0D0D0F]">{user.fullName}</h3>
              <p className="text-xs text-[#6B655B]">
                {user.email} · Role: Main Administrator
              </p>
            </div>
          </div>
          <PWAInstallButton variant="light" />
        </div>
      </section>

      <form onSubmit={handlePasswordChange} className="rounded-xl border border-[#E5DFD3] bg-white p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-[#EFEAE0] pb-3">
          <Lock className="h-4 w-4 text-[#8A6820]" />
          <h3 className="text-sm font-semibold text-[#0D0D0F]">Change Administrator Password</h3>
        </div>

        {message && (
          <div
            role={message.type === 'err' ? 'alert' : 'status'}
            className={`rounded-lg border p-3 text-xs font-medium ${
              message.type === 'err'
                ? 'border-[#B91C1C]/30 bg-[#FEF2F2] text-[#991B1B]'
                : 'border-[#15803D]/30 bg-[#F0FDF4] text-[#166534]'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="adm-cur-pass" className="block text-xs font-medium text-[#3A3731]">
              Current Password
            </label>
            <input
              id="adm-cur-pass"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label htmlFor="adm-new-pass" className="block text-xs font-medium text-[#3A3731]">
              New Password (min 8 characters)
            </label>
            <input
              id="adm-new-pass"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 text-xs"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[#0D0D0F] px-5 py-2 text-xs font-medium text-[#FAF7F0] hover:bg-[#1E1E24]"
        >
          {saving ? 'Updating...' : 'Update Password'}
        </button>
      </form>
    </div>
  );
};
